/**
 * Resource-level ACL primitives (judgement layer 4 in docs/authz-architecture.md §4),
 * generalized from ai-knowledge's document/folder permission model
 * (apps/api/src/modules/documents/document-access.service.ts) so any resource type
 * (document, folder, call_task, campaign, ...) can reuse the same grant table and the
 * same judgement code — see the `ResourceGrant` model in §3.
 */
export type AclSubjectType = "USER" | "DEPARTMENT" | "ROLE";

/** A single grant row, as read from the `resource_grants` table for one resource. */
export interface AclGrant {
  subjectType: AclSubjectType;
  subjectId: string;
  /** bitmask, see `AclPerm` */
  perms: number;
}

export interface AclSubjectContext {
  userId: string;
  tenantId: string;
  roles: string[];
  departmentId?: string | null;
}

export const AclPerm = {
  VIEW: 1 << 0,
  DOWNLOAD: 1 << 1,
  EDIT: 1 << 2,
  DELETE: 1 << 3,
  /** MANAGE implies all of the above, applied automatically by `resolveGrantedPerms`. */
  MANAGE: 1 << 4,
} as const;

export type AclPermFlag = (typeof AclPerm)[keyof typeof AclPerm];

export const ALL_ACL_PERMS: number = Object.values(AclPerm).reduce(
  (acc, bit) => acc | bit,
  0,
);

export interface AclAccessFlags {
  canView: boolean;
  canDownload: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManage: boolean;
}
