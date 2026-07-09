import { describe, expect, it } from "vitest";
import { can, SUPER_ADMIN_ROLE, type RolePermissionMap } from "./can.js";
import { buildPermission } from "./permission.js";

const READ = buildPermission("kb", "document", "read");
const MANAGE = buildPermission("kb", "document", "manage");
const OTHER = buildPermission("call", "task", "dispatch");

const roleMap: RolePermissionMap = {
  editor: [READ],
  admin: [READ, MANAGE],
};

describe("can", () => {
  it("allows super_admin regardless of the role map", () => {
    expect(can({ roles: [SUPER_ADMIN_ROLE] }, [OTHER], {})).toBe(true);
  });

  it("allows when no permission is required", () => {
    expect(can({ roles: [] }, [], roleMap)).toBe(true);
  });

  it("denies when the user's roles do not grant the required permission", () => {
    expect(can({ roles: ["editor"] }, [MANAGE], roleMap)).toBe(false);
  });

  it("denies when the user has no matching role at all", () => {
    expect(can({ roles: ["viewer"] }, [READ], roleMap)).toBe(false);
  });

  it("allows when permissions are granted across multiple roles", () => {
    expect(can({ roles: ["editor"] }, [READ], roleMap)).toBe(true);
  });

  it("requires ALL requested permissions to be granted", () => {
    expect(can({ roles: ["admin"] }, [READ, MANAGE], roleMap)).toBe(true);
    expect(can({ roles: ["editor"] }, [READ, MANAGE], roleMap)).toBe(false);
  });
});
