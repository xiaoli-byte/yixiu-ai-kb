import { describe, expect, it } from "vitest";
import { AclPerm } from "./types.js";
import { hasAccess, resolveAccessFlags, resolveGrantedPerms } from "./resolve.js";
import type { AclGrant, AclSubjectContext } from "./types.js";

const ctx = (overrides: Partial<AclSubjectContext> = {}): AclSubjectContext => ({
  userId: "user-1",
  tenantId: "tenant-1",
  roles: ["viewer"],
  departmentId: "dept-1",
  ...overrides,
});

describe("resolveGrantedPerms", () => {
  it("grants everything to super_admin regardless of grants", () => {
    const perms = resolveGrantedPerms([], ctx({ roles: ["super_admin"] }));
    expect(hasAccess([], ctx({ roles: ["super_admin"] }), AclPerm.MANAGE)).toBe(true);
    expect(perms).toBeGreaterThan(0);
  });

  it("denies by default with no grants, no owner, not public", () => {
    expect(resolveGrantedPerms([], ctx())).toBe(0);
  });

  it("grants ownerPerms when ownerId matches the subject", () => {
    const perms = resolveGrantedPerms([], ctx(), { ownerId: "user-1" });
    expect(perms & AclPerm.VIEW).toBeTruthy();
    expect(perms & AclPerm.EDIT).toBeTruthy();
  });

  it("does not grant owner perms to a different user", () => {
    const perms = resolveGrantedPerms([], ctx(), { ownerId: "someone-else" });
    expect(perms).toBe(0);
  });

  it("grants publicPerms when isPublic is true", () => {
    const perms = resolveGrantedPerms([], ctx(), { isPublic: true });
    expect(perms).toBe(AclPerm.VIEW);
  });

  it("honors a direct USER grant", () => {
    const grants: AclGrant[] = [{ subjectType: "USER", subjectId: "user-1", perms: AclPerm.VIEW }];
    expect(resolveGrantedPerms(grants, ctx())).toBe(AclPerm.VIEW);
  });

  it("ignores a USER grant for a different user", () => {
    const grants: AclGrant[] = [{ subjectType: "USER", subjectId: "someone-else", perms: AclPerm.VIEW }];
    expect(resolveGrantedPerms(grants, ctx())).toBe(0);
  });

  it("honors a DEPARTMENT grant matching ctx.departmentId", () => {
    const grants: AclGrant[] = [{ subjectType: "DEPARTMENT", subjectId: "dept-1", perms: AclPerm.DOWNLOAD }];
    expect(resolveGrantedPerms(grants, ctx())).toBe(AclPerm.DOWNLOAD);
  });

  it("honors a ROLE grant matching one of ctx.roles", () => {
    const grants: AclGrant[] = [{ subjectType: "ROLE", subjectId: "viewer", perms: AclPerm.VIEW }];
    expect(resolveGrantedPerms(grants, ctx({ roles: ["editor", "viewer"] }))).toBe(AclPerm.VIEW);
  });

  it("MANAGE implies every other perm", () => {
    const grants: AclGrant[] = [{ subjectType: "USER", subjectId: "user-1", perms: AclPerm.MANAGE }];
    const flags = resolveAccessFlags(grants, ctx());
    expect(flags).toEqual({
      canView: true,
      canDownload: true,
      canEdit: true,
      canDelete: true,
      canManage: true,
    });
  });
});
