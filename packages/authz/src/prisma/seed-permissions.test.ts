import { describe, expect, it, vi } from "vitest";
import { seedPermissionsAndRoles, seedRoles, type AuthzPrismaClient } from "./seed-permissions.js";

function makeFakePrisma(): AuthzPrismaClient {
  const permissionsById = new Map<string, { id: string; key: string }>();
  let nextId = 1;
  return {
    permission: {
      upsert: vi.fn(async ({ create }) => {
        const row = { id: `perm-${nextId++}`, key: create.key };
        permissionsById.set(row.key, row);
        return row;
      }),
    },
    role: {
      upsert: vi.fn(async () => ({ id: "role-1" })),
    },
    rolePermission: {
      deleteMany: vi.fn(async () => ({})),
      createMany: vi.fn(async () => ({})),
    },
  };
}

describe("seedPermissionsAndRoles", () => {
  it("upserts permissions then roles, replacing role-permission links", async () => {
    const prisma = makeFakePrisma();
    await seedPermissionsAndRoles(
      prisma,
      [{ key: "kb:document:read" }, { key: "kb:document:manage" }],
      [{ key: "editor", name: "Editor", permissionKeys: ["kb:document:read"] }],
    );

    expect(prisma.permission.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.role.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({ where: { roleId: "role-1" } });
    expect(prisma.rolePermission.createMany).toHaveBeenCalledWith({
      data: [{ roleId: "role-1", permissionId: "perm-1" }],
    });
  });

  it("throws when a role references an unknown permission key", async () => {
    const prisma = makeFakePrisma();
    await expect(
      seedRoles(
        prisma,
        [{ key: "editor", name: "Editor", permissionKeys: ["kb:document:read"] }],
        new Map(),
      ),
    ).rejects.toThrow(/unknown permission key/);
  });
});
