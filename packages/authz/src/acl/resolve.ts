import { AccessDeniedError } from "./errors.js";
import { ALL_ACL_PERMS, AclPerm, type AclAccessFlags, type AclGrant, type AclSubjectContext } from "./types.js";

const DEFAULT_SUPER_ROLES = ["super_admin"];

export interface ResolveOptions {
  /** roles that bypass ACL entirely and get every perm; default ["super_admin"] */
  superRoles?: string[];
  /** resource owner's userId; if it matches ctx.userId, `ownerPerms` is granted automatically */
  ownerId?: string | null;
  /** perms granted to the owner; default = every perm */
  ownerPerms?: number;
  /** whether the resource is publicly visible within the tenant absent any explicit grant */
  isPublic?: boolean;
  /** perms granted by `isPublic`; default = VIEW only */
  publicPerms?: number;
}

export function hasFlag(perms: number, flag: number): boolean {
  return (perms & flag) === flag;
}

/**
 * Pure judgement over already-fetched grants for a single resource — this package does
 * no DB I/O itself (see `visibleWhereSql` in sql.ts for the query-time equivalent used
 * when filtering a list, and the host's own data layer for fetching `grants`).
 */
export function resolveGrantedPerms(
  grants: AclGrant[],
  ctx: AclSubjectContext,
  options: ResolveOptions = {},
): number {
  const superRoles = options.superRoles ?? DEFAULT_SUPER_ROLES;
  if (ctx.roles.some((role) => superRoles.includes(role))) {
    return ALL_ACL_PERMS;
  }

  let perms = 0;
  if (options.ownerId && options.ownerId === ctx.userId) {
    perms |= options.ownerPerms ?? ALL_ACL_PERMS;
  }
  if (options.isPublic) {
    perms |= options.publicPerms ?? AclPerm.VIEW;
  }

  for (const grant of grants) {
    if (grant.subjectType === "USER" && grant.subjectId === ctx.userId) {
      perms |= grant.perms;
    } else if (
      grant.subjectType === "DEPARTMENT" &&
      ctx.departmentId != null &&
      grant.subjectId === ctx.departmentId
    ) {
      perms |= grant.perms;
    } else if (grant.subjectType === "ROLE" && ctx.roles.includes(grant.subjectId)) {
      perms |= grant.perms;
    }
  }

  if (hasFlag(perms, AclPerm.MANAGE)) {
    perms |= ALL_ACL_PERMS;
  }

  return perms;
}

export function resolveAccessFlags(
  grants: AclGrant[],
  ctx: AclSubjectContext,
  options?: ResolveOptions,
): AclAccessFlags {
  const perms = resolveGrantedPerms(grants, ctx, options);
  return {
    canView: hasFlag(perms, AclPerm.VIEW),
    canDownload: hasFlag(perms, AclPerm.DOWNLOAD),
    canEdit: hasFlag(perms, AclPerm.EDIT),
    canDelete: hasFlag(perms, AclPerm.DELETE),
    canManage: hasFlag(perms, AclPerm.MANAGE),
  };
}

export function hasAccess(
  grants: AclGrant[],
  ctx: AclSubjectContext,
  required: number,
  options?: ResolveOptions,
): boolean {
  return hasFlag(resolveGrantedPerms(grants, ctx, options), required);
}

export function assertAccess(
  grants: AclGrant[],
  ctx: AclSubjectContext,
  required: number,
  options?: ResolveOptions,
): void {
  if (!hasAccess(grants, ctx, required, options)) {
    throw new AccessDeniedError();
  }
}
