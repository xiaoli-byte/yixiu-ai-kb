import type { AuthClaims } from "./claims.js";
import type { PermissionKey } from "./permission.js";

/**
 * The one role name that bypasses functional RBAC entirely (judgement layer 1 in
 * docs/authz-architecture.md §4). Fixed on purpose — both systems must agree on the same
 * super-admin role name, so it is not made configurable per host.
 */
export const SUPER_ADMIN_ROLE = "super_admin";

/** role key -> permission keys granted to that role */
export type RolePermissionMap = Record<string, PermissionKey[]>;

/**
 * Functional-level RBAC check (layer 1 + layer 3 of the judgement order in
 * docs/authz-architecture.md §4). Resource-level ACL (layer 4) and tenant isolation
 * (layer 2) are separate concerns handled by `acl/` and by the host's query layer.
 */
export function can(
  claims: Pick<AuthClaims, "roles">,
  required: PermissionKey[],
  rolePermissionMap: RolePermissionMap,
): boolean {
  if (required.length === 0) return true;
  if (claims.roles.includes(SUPER_ADMIN_ROLE)) return true;

  const granted = new Set<PermissionKey>();
  for (const role of claims.roles) {
    for (const permission of rolePermissionMap[role] ?? []) {
      granted.add(permission);
    }
  }
  return required.every((permission) => granted.has(permission));
}
