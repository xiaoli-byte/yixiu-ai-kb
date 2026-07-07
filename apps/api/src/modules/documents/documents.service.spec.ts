import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
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
