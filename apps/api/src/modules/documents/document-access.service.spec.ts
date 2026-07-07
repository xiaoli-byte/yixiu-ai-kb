import { describe, expect, it, vi } from "vitest";
import { DocumentAccessService } from "./document-access.service";

function createService() {
  const db = { tenantId: "tenant-1", userId: "user-1", query: vi.fn(), queryOne: vi.fn() };
  return { service: new DocumentAccessService(db as any), db };
}

describe("DocumentAccessService", () => {
  it("allows super admins to manage existing tenant documents", async () => {
    const { service, db } = createService();
    db.query.mockResolvedValueOnce([
      {
        document_id: "doc-1",
        can_view: true,
        can_download: true,
        can_edit: true,
        can_delete: true,
        can_manage_permission: true,
      },
    ]);

    await expect(
      service.canAccessDocument("doc-1", "MANAGE_PERMISSION", {
        userId: "admin-1",
        tenantId: "tenant-1",
        role: "super_admin",
      }),
    ).resolves.toBe(true);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("builds a visibility SQL fragment scoped to tenant, owner, role, department, and grants", () => {
    const { service } = createService();
    const fragment = service.visibleDocumentWhereSql("d", {
      userId: "user-1",
      tenantId: "tenant-1",
      role: "viewer",
      departmentId: "dept-1",
    });

    expect(fragment.sql).toContain("d.tenant_id = $1");
    expect(fragment.sql).toContain("d.deleted_at IS NULL");
    expect(fragment.sql).toContain("document_permissions");
    expect(fragment.sql).toContain("folder_permissions");
    expect(fragment.values).toEqual(["tenant-1", "user-1", "viewer", "dept-1"]);
  });

  it("supports offset placeholders for composable visibility SQL", () => {
    const { service } = createService();
    const fragment = service.visibleDocumentWhereSql(
      "doc",
      {
        userId: "user-1",
        tenantId: "tenant-1",
        role: "viewer",
        departmentId: "dept-1",
      },
      4,
    );

    expect(fragment.sql).toContain("doc.tenant_id = $4");
    expect(fragment.sql).toContain("doc.owner_id = $5");
    expect(fragment.sql).toContain("doc_role.subject_id = $6");
    expect(fragment.sql).toContain("doc_dept.subject_id = $7");
    expect(fragment.values).toEqual(["tenant-1", "user-1", "viewer", "dept-1"]);
  });

  it("rejects unsafe SQL aliases", () => {
    const { service } = createService();

    expect(() =>
      service.visibleDocumentWhereSql("d; DROP TABLE documents", {
        userId: "user-1",
        tenantId: "tenant-1",
        role: "viewer",
      }),
    ).toThrow("Invalid SQL alias");
  });

  it("maps access flags from rows without exposing missing grants", async () => {
    const { service, db } = createService();
    db.query.mockResolvedValueOnce([
      {
        document_id: "doc-1",
        can_view: true,
        can_download: false,
        can_edit: false,
        can_delete: false,
        can_manage_permission: false,
      },
    ]);

    await expect(
      service.getAccessFlags(["doc-1"], {
        userId: "user-1",
        tenantId: "tenant-1",
        role: "viewer",
      }),
    ).resolves.toEqual({
      "doc-1": {
        canView: true,
        canDownload: false,
        canEdit: false,
        canDelete: false,
        canManagePermission: false,
      },
    });
  });

  it("returns full admin flags only for documents returned by the database", async () => {
    const { service, db } = createService();
    db.query.mockResolvedValueOnce([
      {
        document_id: "doc-1",
        can_view: true,
        can_download: true,
        can_edit: true,
        can_delete: true,
        can_manage_permission: true,
      },
    ]);

    await expect(
      service.getAccessFlags(["doc-1", "missing-doc"], {
        userId: "admin-1",
        tenantId: "tenant-1",
        role: "admin",
      }),
    ).resolves.toEqual({
      "doc-1": {
        canView: true,
        canDownload: true,
        canEdit: true,
        canDelete: true,
        canManagePermission: true,
      },
      "missing-doc": {
        canView: false,
        canDownload: false,
        canEdit: false,
        canDelete: false,
        canManagePermission: false,
      },
    });
  });

  it("returns full super admin flags only for documents returned by the database", async () => {
    const { service, db } = createService();
    db.query.mockResolvedValueOnce([
      {
        document_id: "doc-1",
        can_view: true,
        can_download: true,
        can_edit: true,
        can_delete: true,
        can_manage_permission: true,
      },
    ]);

    await expect(
      service.getAccessFlags(["doc-1", "cross-tenant-doc"], {
        userId: "root-1",
        tenantId: "tenant-1",
        role: "super_admin",
      }),
    ).resolves.toEqual({
      "doc-1": {
        canView: true,
        canDownload: true,
        canEdit: true,
        canDelete: true,
        canManagePermission: true,
      },
      "cross-tenant-doc": {
        canView: false,
        canDownload: false,
        canEdit: false,
        canDelete: false,
        canManagePermission: false,
      },
    });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("limits tenant-wide admin defaults to super_admin and admin roles", async () => {
    const { service, db } = createService();
    db.query.mockResolvedValueOnce([]);

    await service.getAccessFlags(["doc-1"], {
      userId: "admin-1",
      tenantId: "tenant-1",
      role: "knowledge_base_admin",
    });

    const accessSql = db.query.mock.calls[0][0] as string;
    const visibilityFragment = service.visibleDocumentWhereSql("d", {
      userId: "admin-1",
      tenantId: "tenant-1",
      role: "knowledge_base_admin",
    });
    expect(accessSql).toContain("ARRAY['super_admin', 'admin']");
    expect(visibilityFragment.sql).toContain("ARRAY['super_admin', 'admin']");
    expect(accessSql).not.toContain("knowledge_base_admin");
    expect(visibilityFragment.sql).not.toContain("knowledge_base_admin");
  });

  it("uses deterministic grant precedence instead of OR-ing lower priority grants", async () => {
    const { service, db } = createService();
    db.query.mockResolvedValueOnce([]);

    await service.getAccessFlags(["doc-1"], {
      userId: "user-1",
      tenantId: "tenant-1",
      role: "viewer",
      departmentId: "dept-1",
    });

    const sql = db.query.mock.calls[0][0] as string;
    expect(sql).not.toContain("BOOL_OR");
    expect(sql).toMatch(
      /COALESCE\(\s*doc_user\.can_view,\s*doc_dept\.can_view,\s*doc_role\.can_view,\s*folder_user\.can_view,\s*folder_dept\.can_view,\s*folder_role\.can_view,\s*\(d\.owner_id = \$3 AND d\.permission_scope <> 'ADMIN'\) OR d\.permission_scope IN \('COMPANY', 'PUBLIC'\)\s*\)/,
    );
    expect(sql).toContain(
      "COALESCE(doc_user.can_edit, doc_dept.can_edit, doc_role.can_edit, folder_user.can_edit, folder_dept.can_edit, folder_role.can_edit, FALSE)",
    );
  });

  it("does not grant non-admin owners default view of ADMIN-scope documents", async () => {
    const { service, db } = createService();
    db.query.mockResolvedValueOnce([]);

    await service.getAccessFlags(["doc-1"], {
      userId: "owner-1",
      tenantId: "tenant-1",
      role: "viewer",
    });

    const accessSql = db.query.mock.calls[0][0] as string;
    const visibilityFragment = service.visibleDocumentWhereSql("d", {
      userId: "owner-1",
      tenantId: "tenant-1",
      role: "viewer",
    });

    expect(accessSql).toContain(
      "(d.owner_id = $3 AND d.permission_scope <> 'ADMIN') OR d.permission_scope IN ('COMPANY', 'PUBLIC')",
    );
    expect(visibilityFragment.sql).toContain(
      "(d.owner_id = $2 AND d.permission_scope <> 'ADMIN') OR d.permission_scope IN ('COMPANY', 'PUBLIC')",
    );
  });

  it("defaults owners to view only and requires explicit grants for action flags", async () => {
    const { service, db } = createService();
    db.query.mockResolvedValueOnce([]);

    await service.getAccessFlags(["doc-1"], {
      userId: "owner-1",
      tenantId: "tenant-1",
      role: "viewer",
    });

    const sql = db.query.mock.calls[0][0] as string;
    expect(sql).toContain(
      "(d.owner_id = $3 AND d.permission_scope <> 'ADMIN') OR d.permission_scope IN ('COMPANY', 'PUBLIC')",
    );
    expect(sql).toContain(
      "COALESCE(doc_user.can_download, doc_dept.can_download, doc_role.can_download, folder_user.can_download, folder_dept.can_download, folder_role.can_download, FALSE)",
    );
    expect(sql).toContain(
      "COALESCE(doc_user.can_delete, doc_dept.can_delete, doc_role.can_delete, folder_user.can_delete, folder_dept.can_delete, folder_role.can_delete, FALSE)",
    );
    expect(sql).toContain(
      "COALESCE(doc_user.can_manage_permission, doc_dept.can_manage_permission, doc_role.can_manage_permission, folder_user.can_manage_permission, folder_dept.can_manage_permission, folder_role.can_manage_permission, FALSE)",
    );
    expect(sql).not.toContain("folder_role.can_download,\n             d.owner_id = $3");
    expect(sql).not.toContain("folder_role.can_delete, d.owner_id = $3");
    expect(sql).not.toContain("folder_role.can_manage_permission,\n             d.owner_id = $3");
  });

  it("considers folder grants after explicit document grants", async () => {
    const { service, db } = createService();
    db.query.mockResolvedValueOnce([]);

    await service.getAccessFlags(["doc-1"], {
      userId: "user-1",
      tenantId: "tenant-1",
      role: "viewer",
      departmentId: "dept-1",
    });

    const sql = db.query.mock.calls[0][0] as string;
    expect(sql.indexOf("doc_user")).toBeLessThan(sql.indexOf("folder_user"));
    expect(sql.indexOf("doc_dept")).toBeLessThan(sql.indexOf("folder_dept"));
    expect(sql.indexOf("doc_role")).toBeLessThan(sql.indexOf("folder_role"));
    expect(sql).toContain("folder_permissions folder_user");
    expect(sql).toContain("folder_permissions folder_dept");
    expect(sql).toContain("folder_permissions folder_role");
  });

  it("snapshots folder defaults without writing inherited rows to document_permissions", async () => {
    const { service, db } = createService();
    db.query.mockResolvedValueOnce([]);

    await service.applyInheritedFolderPermissions("doc-1", "folder-1", "actor-1");

    expect(db.query).toHaveBeenCalledTimes(1);
    for (const [sql] of db.query.mock.calls) {
      expect(sql).not.toContain("document_permissions");
    }
  });

  it("only snapshots folder defaults onto documents in that folder", async () => {
    const { service, db } = createService();
    db.query.mockResolvedValueOnce([]);

    await service.applyInheritedFolderPermissions("doc-1", "folder-1", "actor-1");

    const sql = db.query.mock.calls[0][0] as string;
    expect(sql).toContain("AND d.folder_id = $2");
  });
});
