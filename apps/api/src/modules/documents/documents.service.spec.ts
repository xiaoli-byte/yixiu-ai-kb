import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { DocumentListQuery } from "@ai-knowledge/schemas";
import { describe, expect, it, vi } from "vitest";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

function createService() {
  const prisma = {
    $transaction: vi.fn(),
    document: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    folder: {
      findFirst: vi.fn(),
    },
  };
  const db = {
    tenantId: "tenant-1",
    userId: "user-1",
    role: "viewer",
    query: vi.fn(),
    queryOne: vi.fn(),
  };
  const storage = {
    putObject: vi.fn(),
    removeObject: vi.fn(),
  };
  const queue = {
    enqueueDocument: vi.fn(),
  };
  const neo4j = {
    run: vi.fn(),
  };
  const access = {
    visibleDocumentWhereSql: vi.fn().mockReturnValue({
      sql: "(d.tenant_id = $1 AND d.deleted_at IS NULL)",
      values: ["tenant-1"],
    }),
    getAccessFlags: vi.fn().mockResolvedValue({}),
    assertDocumentAccess: vi.fn().mockResolvedValue(undefined),
    applyInheritedFolderPermissions: vi.fn().mockResolvedValue(undefined),
    writeAuditLog: vi.fn().mockResolvedValue(undefined),
  };

  const service = new (DocumentsService as any)(
    prisma,
    db,
    storage,
    queue,
    neo4j,
    access,
  ) as DocumentsService;

  return { service, prisma, db, storage, queue, neo4j, access };
}

const user = {
  sub: "user-1",
  tenantId: "tenant-1",
  role: "editor",
  departmentId: "dept-1",
};

function file(overrides: Partial<Express.Multer.File> = {}) {
  return {
    originalname: "policy.pdf",
    mimetype: "application/pdf",
    size: 11,
    buffer: Buffer.from("hello world"),
    ...overrides,
  } as Express.Multer.File;
}

describe("DocumentsService permission-aware operations", () => {
  it("parses archived=false query strings as false", () => {
    expect(DocumentListQuery.parse({ archived: "false" }).archived).toBe(false);
    expect(DocumentListQuery.parse({ archived: "true" }).archived).toBe(true);
    expect(DocumentListQuery.parse({ archived: false }).archived).toBe(false);
    expect(DocumentListQuery.parse({ archived: true }).archived).toBe(true);
    expect(DocumentListQuery.parse({}).archived).toBeUndefined();
  });

  it("list calls DocumentAccessService.visibleDocumentWhereSql and returns access flags", async () => {
    const { service, prisma, db, access } = createService();
    prisma.$transaction.mockResolvedValueOnce([[], 0]);
    db.query
      .mockResolvedValueOnce([
        {
          id: "doc-1",
          title: "Policy",
          mime: "application/pdf",
          size: 10,
          status: "READY",
          folder_id: null,
          content_id: null,
          file_hash: null,
          content_hash: null,
          duplicate_of_document_id: null,
          dedup_reason: null,
          owner_id: "user-1",
          owner_name: "Alice",
          permission_scope: "PRIVATE",
          searchable: true,
          ai_reference_enabled: true,
          archived: false,
          deleted_at: null,
          tags: [],
          created_at: new Date("2026-07-07T00:00:00.000Z"),
          updated_at: new Date("2026-07-07T00:00:00.000Z"),
          total_count: 1,
        },
      ])
      .mockResolvedValueOnce([{ total: 1 }]);
    access.getAccessFlags.mockResolvedValueOnce({
      "doc-1": {
        canView: true,
        canDownload: true,
        canEdit: false,
        canDelete: false,
        canManagePermission: false,
      },
    });

    const result = await (service as any).list({ page: 1, pageSize: 20 }, user);

    expect(access.visibleDocumentWhereSql).toHaveBeenCalledWith(
      "d",
      {
        userId: "user-1",
        tenantId: "tenant-1",
        role: "editor",
        departmentId: "dept-1",
      },
      expect.any(Number),
    );
    expect(result.items[0]).toMatchObject({
      id: "doc-1",
      canView: true,
      canDownload: true,
    });
  });

  it("upload applies folder inheritance when folderId is present", async () => {
    const { service, prisma, db, storage, queue, access } = createService();
    prisma.folder.findFirst.mockResolvedValueOnce({ id: "folder-1" });
    db.queryOne.mockResolvedValueOnce(null);
    prisma.document.create.mockResolvedValueOnce({
      id: "doc-1",
      title: "policy.pdf",
      status: "PENDING",
      contentId: null,
    });

    await service.upload(file(), "user-1", "tenant-1", "folder-1");

    expect(storage.putObject).toHaveBeenCalledTimes(1);
    expect(queue.enqueueDocument).toHaveBeenCalledWith({
      documentId: "doc-1",
      tenantId: "tenant-1",
    });
    expect(access.applyInheritedFolderPermissions).toHaveBeenCalledWith(
      "doc-1",
      "folder-1",
      "user-1",
    );
  });

  it("upload rejects unknown target folder before storing or creating the document", async () => {
    const { service, prisma, db, storage, queue } = createService();
    prisma.folder.findFirst.mockResolvedValueOnce(null);

    await expect(service.upload(file(), "user-1", "tenant-1", "missing-folder")).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prisma.folder.findFirst).toHaveBeenCalledWith({
      where: { id: "missing-folder", tenantId: "tenant-1" } as any,
      select: { id: true },
    });
    expect(db.queryOne).not.toHaveBeenCalled();
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(prisma.document.create).not.toHaveBeenCalled();
    expect(queue.enqueueDocument).not.toHaveBeenCalled();
  });

  it("logical delete sets deletedAt and does not hard-delete or clean graph/storage", async () => {
    const { service, prisma, storage, neo4j, access } = createService();
    prisma.document.findFirst.mockResolvedValueOnce({
      id: "doc-1",
      tenantId: "tenant-1",
      storageKey: "tenant-1/doc-1.pdf",
      contentId: null,
    });
    prisma.document.update.mockResolvedValueOnce({ id: "doc-1" });

    await (service as any).remove("doc-1", user);

    expect(access.assertDocumentAccess).toHaveBeenCalledWith(
      "doc-1",
      "DELETE",
      {
        userId: "user-1",
        tenantId: "tenant-1",
        role: "editor",
        departmentId: "dept-1",
      },
    );
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: expect.objectContaining({
        deletedAt: expect.any(Date),
        deletedBy: "user-1",
      }),
    });
    expect(prisma.document.delete).not.toHaveBeenCalled();
    expect(neo4j.run).not.toHaveBeenCalled();
    expect(storage.removeObject).not.toHaveBeenCalled();
  });

  it("update requires document EDIT access before mutating", async () => {
    const { service, prisma, access } = createService();
    access.assertDocumentAccess.mockRejectedValueOnce(new ForbiddenException("denied"));

    await expect(
      (service as any).update("doc-1", { title: "New title" }, user),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(access.assertDocumentAccess).toHaveBeenCalledWith(
      "doc-1",
      "EDIT",
      {
        userId: "user-1",
        tenantId: "tenant-1",
        role: "editor",
        departmentId: "dept-1",
      },
    );
    expect(prisma.document.update).not.toHaveBeenCalled();
  });

  it("update validates target folder and applies inherited permissions when folderId changes", async () => {
    const { service, prisma, access } = createService();
    prisma.document.findFirst.mockResolvedValueOnce({
      id: "doc-1",
      tenantId: "tenant-1",
      folderId: null,
    });
    prisma.folder.findFirst.mockResolvedValueOnce({ id: "folder-1" });
    prisma.document.update.mockResolvedValueOnce({
      id: "doc-1",
      title: "Policy",
      mime: "application/pdf",
      size: BigInt(10),
      status: "READY",
      folderId: "folder-1",
      ownerId: "user-1",
      tenantId: "tenant-1",
      errorMessage: null,
      createdAt: new Date("2026-07-07T00:00:00.000Z"),
      updatedAt: new Date("2026-07-07T00:00:00.000Z"),
    });

    await expect((service as any).update("doc-1", { folderId: "folder-1" }, user)).resolves.toMatchObject({
      id: "doc-1",
      folderId: "folder-1",
    });

    expect(prisma.folder.findFirst).toHaveBeenCalledWith({
      where: { id: "folder-1", tenantId: "tenant-1" } as any,
      select: { id: true },
    });
    expect(access.applyInheritedFolderPermissions).toHaveBeenCalledWith(
      "doc-1",
      "folder-1",
      "user-1",
    );
  });

  it("update rejects non-string folderId before folder lookup or mutation", async () => {
    const { service, prisma } = createService();
    prisma.document.findFirst.mockResolvedValueOnce({
      id: "doc-1",
      tenantId: "tenant-1",
      folderId: null,
    });

    await expect(
      (service as any).update("doc-1", { folderId: 123 }, user),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.folder.findFirst).not.toHaveBeenCalled();
    expect(prisma.document.update).not.toHaveBeenCalled();
  });

  it("controller checks document EDIT access before tag mutations", async () => {
    const docs = {
      assertDocumentEditAccess: vi.fn().mockRejectedValue(new ForbiddenException("denied")),
    };
    const tags = {
      addTagToDocument: vi.fn(),
      removeTagFromDocument: vi.fn(),
    };
    const controller = new DocumentsController(docs as any, tags as any, {} as any);

    await expect(controller.addTag("doc-1", "tag-1", user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.removeTag("doc-1", "tag-1", user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(docs.assertDocumentEditAccess).toHaveBeenCalledTimes(2);
    expect(tags.addTagToDocument).not.toHaveBeenCalled();
    expect(tags.removeTagFromDocument).not.toHaveBeenCalled();
  });

  it("controller wraps invalid list query in BadRequestException", async () => {
    const docs = {
      list: vi.fn(),
    };
    const controller = new DocumentsController(docs as any, {} as any, {} as any);

    await expect(controller.list({ page: "0" }, user)).rejects.toBeInstanceOf(BadRequestException);

    expect(docs.list).not.toHaveBeenCalled();
  });

  it("controller rejects invalid update body before calling service", async () => {
    const docs = {
      update: vi.fn(),
    };
    const controller = new DocumentsController(docs as any, {} as any, {} as any);

    await expect(
      controller.update("doc-1", { folderId: 123 } as any, user),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(docs.update).not.toHaveBeenCalled();
  });

  it("batch archive returns per-document results", async () => {
    const { service, prisma, access } = createService();
    access.assertDocumentAccess
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ForbiddenException("denied"));
    prisma.document.update.mockResolvedValueOnce({ id: "doc-1", archived: true });

    await expect(
      (service as any).batch(
        { action: "ARCHIVE", documentIds: ["doc-1", "doc-2"] },
        user,
      ),
    ).resolves.toEqual({
      action: "ARCHIVE",
      results: [
        { documentId: "doc-1", ok: true },
        { documentId: "doc-2", ok: false, message: "denied" },
      ],
    });
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: { archived: true, updatedAt: expect.any(Date) },
    });
  });

  it("batch move rejects unknown target folder before update or inheritance", async () => {
    const { service, prisma, access } = createService();
    prisma.folder.findFirst.mockResolvedValueOnce(null);

    await expect(
      (service as any).batch(
        { action: "MOVE", documentIds: ["doc-1"], folderId: "missing-folder" },
        user,
      ),
    ).resolves.toEqual({
      action: "MOVE",
      results: [
        {
          documentId: "doc-1",
          ok: false,
          message: "Folder not found",
        },
      ],
    });

    expect(prisma.folder.findFirst).toHaveBeenCalledWith({
      where: { id: "missing-folder", tenantId: "tenant-1" } as any,
      select: { id: true },
    });
    expect(prisma.document.update).not.toHaveBeenCalled();
    expect(access.applyInheritedFolderPermissions).not.toHaveBeenCalled();
  });

  it("batch download returns explicit per-document failures instead of succeeding silently", async () => {
    const { service, prisma, access } = createService();

    await expect(
      (service as any).batch({ action: "DOWNLOAD", documentIds: ["doc-1"] }, user),
    ).resolves.toEqual({
      action: "DOWNLOAD",
      results: [
        {
          documentId: "doc-1",
          ok: false,
          message: "Batch download is not supported yet",
        },
      ],
    });

    expect(access.assertDocumentAccess).not.toHaveBeenCalled();
    expect(prisma.document.update).not.toHaveBeenCalled();
  });

  it("setPermissions performs permission updates and audit log in a Prisma transaction", async () => {
    const { service, prisma, db, access } = createService();
    const tx = {
      $queryRawUnsafe: vi.fn(),
      $executeRawUnsafe: vi.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));
    tx.$queryRawUnsafe
      .mockResolvedValueOnce([
        {
          id: "doc-1",
          permission_scope: "PRIVATE",
          searchable: true,
          ai_reference_enabled: true,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "doc-1",
          permission_scope: "COMPANY",
          searchable: false,
          ai_reference_enabled: true,
        },
      ])
      .mockResolvedValueOnce([
        {
          subject_type: "USER",
          subject_id: "user-2",
          can_view: true,
          can_download: true,
          can_edit: false,
          can_delete: false,
          can_manage_permission: false,
        },
      ]);

    await expect(
      service.setPermissions(
        "doc-1",
        {
          permissionScope: "COMPANY",
          searchable: false,
          aiReferenceEnabled: true,
          mode: "OVERWRITE",
          entries: [
            {
              subjectType: "USER",
              subjectId: "user-2",
              canView: true,
              canDownload: true,
              canEdit: false,
              canDelete: false,
              canManagePermission: false,
            },
          ],
        },
        user,
      ),
    ).resolves.toMatchObject({
      documentId: "doc-1",
      permissionScope: "COMPANY",
      searchable: false,
      aiReferenceEnabled: true,
      entries: [{ subjectType: "USER", subjectId: "user-2" }],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();
    expect(access.writeAuditLog).not.toHaveBeenCalled();
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE documents"),
      "doc-1",
      "tenant-1",
      "COMPANY",
      false,
      true,
    );
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM document_permissions"),
      "doc-1",
      "tenant-1",
    );
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO permission_audit_logs"),
      expect.any(String),
      "tenant-1",
      "user-1",
      "DOCUMENT",
      "doc-1",
      "PERMISSION_UPDATE",
      "OVERWRITE",
      expect.any(String),
      expect.any(String),
    );
  });

  it("wraps invalid permission and batch requests in BadRequestException", async () => {
    const { service, prisma, access } = createService();

    await expect(service.setPermissions("doc-1", { permissionScope: "NOPE" }, user)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect((service as any).batch({ action: "NOPE", documentIds: ["doc-1"] }, user)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      (service as any).setBatchPermissions({ documentIds: [123], permissionScope: "COMPANY" }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      (service as any).setBatchPermissions({ documentIds: [], permissionScope: "COMPANY" }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      (service as any).setBatchPermissions({ documentIds: ["   "], permissionScope: "COMPANY" }, user),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(access.assertDocumentAccess).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("trims and deduplicates batch permission documentIds before applying permissions", async () => {
    const { service } = createService();
    const setPermissions = vi.spyOn(service, "setPermissions").mockResolvedValue({} as any);

    await expect(
      (service as any).setBatchPermissions(
        {
          documentIds: [" doc-1 ", "doc-1", "doc-2"],
          permissionScope: "COMPANY",
        },
        user,
      ),
    ).resolves.toEqual({
      results: [
        { documentId: "doc-1", ok: true },
        { documentId: "doc-2", ok: true },
      ],
    });

    expect(setPermissions).toHaveBeenCalledTimes(2);
    expect(setPermissions).toHaveBeenNthCalledWith(
      1,
      "doc-1",
      expect.objectContaining({ permissionScope: "COMPANY" }),
      user,
    );
    expect(setPermissions).toHaveBeenNthCalledWith(
      2,
      "doc-2",
      expect.objectContaining({ permissionScope: "COMPANY" }),
      user,
    );
  });

  it("parse retry rejects non-FAILED documents and re-enqueues FAILED documents", async () => {
    const { service, prisma, queue } = createService();
    prisma.document.findFirst
      .mockResolvedValueOnce({ id: "doc-ready", status: "READY", tenantId: "tenant-1" })
      .mockResolvedValueOnce({ id: "doc-failed", status: "FAILED", tenantId: "tenant-1" });
    prisma.document.update.mockResolvedValueOnce({ id: "doc-failed", status: "PENDING" });

    await expect((service as any).retryParse("doc-ready", user)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    await expect((service as any).retryParse("doc-failed", user)).resolves.toEqual({
      id: "doc-failed",
      status: "PENDING",
    });
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: "doc-failed" },
      data: expect.objectContaining({
        status: "PENDING",
        errorMessage: null,
      }),
    });
    expect(queue.enqueueDocument).toHaveBeenCalledWith({
      documentId: "doc-failed",
      tenantId: "tenant-1",
    });
  });
});
