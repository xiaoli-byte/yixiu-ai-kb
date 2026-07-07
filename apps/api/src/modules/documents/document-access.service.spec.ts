import { describe, expect, it, vi } from "vitest";
import { DocumentAccessService } from "./document-access.service";

function createService() {
  const db = { tenantId: "tenant-1", userId: "user-1", query: vi.fn(), queryOne: vi.fn() };
  return { service: new DocumentAccessService(db as any), db };
}

describe("DocumentAccessService", () => {
  it("allows super admins to manage documents", async () => {
    const { service } = createService();
    await expect(
      service.canAccessDocument("doc-1", "MANAGE_PERMISSION", {
        userId: "admin-1",
        tenantId: "tenant-1",
        role: "super_admin",
      }),
    ).resolves.toBe(true);
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
    expect(fragment.values).toEqual(["tenant-1", "user-1", "viewer", "dept-1"]);
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
});
