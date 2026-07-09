/**
 * Generic, DB-client-agnostic seed helpers for the `Permission`/`Role`/`RolePermission`
 * models in `schema.partial.prisma`. Each host copies those model definitions into its
 * own schema.prisma, then calls these helpers from its own seed script with its own
 * generated PrismaClient.
 *
 * Structurally typed on purpose (no import of `@prisma/client`) so this package has no
 * hard dependency on either host's generated Prisma client, and no version coupling
 * across the two repos.
 */

export interface PermissionSeedInput {
  key: string;
  description?: string;
}

export interface RoleSeedInput {
  key: string;
  name: string;
  /** null/undefined = built-in role shared across tenants */
  tenantId?: string | null;
  permissionKeys: string[];
}

export interface AuthzPrismaClient {
  permission: {
    upsert(args: {
      where: { key: string };
      update: { description?: string };
      create: { key: string; description?: string };
    }): Promise<{ id: string; key: string }>;
  };
  role: {
    upsert(args: {
      where: { key: string };
      update: { name: string; tenantId?: string | null };
      create: { key: string; name: string; tenantId?: string | null };
    }): Promise<{ id: string }>;
  };
  rolePermission: {
    deleteMany(args: { where: { roleId: string } }): Promise<unknown>;
    createMany(args: {
      data: Array<{ roleId: string; permissionId: string }>;
    }): Promise<unknown>;
  };
}

/** Idempotently upserts every permission code as a `Permission` row. Returns key -> id. */
export async function seedPermissions(
  prisma: AuthzPrismaClient,
  permissions: PermissionSeedInput[],
): Promise<Map<string, string>> {
  const idByKey = new Map<string, string>();
  for (const permission of permissions) {
    const row = await prisma.permission.upsert({
      where: { key: permission.key },
      update: { description: permission.description },
      create: { key: permission.key, description: permission.description },
    });
    idByKey.set(permission.key, row.id);
  }
  return idByKey;
}

/**
 * Idempotently upserts roles and replaces their permission links with `permissionKeys`.
 * Requires every key in `permissionKeys` to already be present in `permissionIdByKey`
 * (typically the map returned by `seedPermissions`, called first).
 */
export async function seedRoles(
  prisma: AuthzPrismaClient,
  roles: RoleSeedInput[],
  permissionIdByKey: Map<string, string>,
): Promise<void> {
  for (const role of roles) {
    const roleRow = await prisma.role.upsert({
      where: { key: role.key },
      update: { name: role.name, tenantId: role.tenantId ?? null },
      create: { key: role.key, name: role.name, tenantId: role.tenantId ?? null },
    });

    const permissionIds = role.permissionKeys.map((key) => {
      const id = permissionIdByKey.get(key);
      if (!id) {
        throw new Error(`seedRoles: unknown permission key "${key}" referenced by role "${role.key}"`);
      }
      return id;
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: roleRow.id } });
    if (permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: roleRow.id, permissionId })),
      });
    }
  }
}

/** Convenience wrapper: seeds permissions then roles in one call. */
export async function seedPermissionsAndRoles(
  prisma: AuthzPrismaClient,
  permissions: PermissionSeedInput[],
  roles: RoleSeedInput[],
): Promise<void> {
  const idByKey = await seedPermissions(prisma, permissions);
  await seedRoles(prisma, roles, idByKey);
}
