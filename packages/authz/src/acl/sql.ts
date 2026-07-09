import type { AclSubjectContext } from "./types.js";
import { AclPerm } from "./types.js";

export interface SqlFragment {
  sql: string;
  values: unknown[];
}

export interface VisibleWhereSqlOptions {
  /** default "resource_grants" (see the ResourceGrant model in docs/authz-architecture.md §3) */
  table?: string;
  /** default AclPerm.VIEW */
  requiredPerm?: number;
  /** default ["super_admin"] */
  superRoles?: string[];
  /** column on the outer `alias` table holding the tenant id; default "tenant_id" */
  tenantColumn?: string;
  /** column on the outer `alias` table holding its primary key; default "id" */
  idColumn?: string;
  /** column on the outer `alias` table holding the owner's userId; when set, the owner always passes */
  ownerColumn?: string;
}

function safeIdentifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return name;
}

/**
 * Builds a parameterized Postgres WHERE fragment that filters rows of `alias` down to
 * those visible to `ctx`, checked against a single generic `resource_grants` table
 * (as opposed to ai-knowledge's original per-resource-type join across
 * document_permissions/folder_permissions — see document-access.service.ts, which this
 * generalizes). Placeholders are numbered starting at `startIndex` ($N) so callers can
 * splice this into a larger parameterized query alongside their own params.
 */
export function visibleWhereSql(
  alias: string,
  resourceType: string,
  ctx: AclSubjectContext,
  startIndex = 1,
  options: VisibleWhereSqlOptions = {},
): SqlFragment {
  const a = safeIdentifier(alias);
  const table = safeIdentifier(options.table ?? "resource_grants");
  const tenantColumn = safeIdentifier(options.tenantColumn ?? "tenant_id");
  const idColumn = safeIdentifier(options.idColumn ?? "id");
  const requiredPerm = options.requiredPerm ?? AclPerm.VIEW;
  const superRoles = options.superRoles ?? ["super_admin"];

  const values: unknown[] = [];
  let i = startIndex;
  const bind = (value: unknown): string => {
    values.push(value);
    return `$${i++}`;
  };

  const tenantParam = bind(ctx.tenantId);
  const superRolesParam = bind(superRoles);
  const rolesParam = bind(ctx.roles);
  const resourceTypeParam = bind(resourceType);
  const userParam = bind(ctx.userId);
  const permParam = bind(requiredPerm);
  const departmentClause = ctx.departmentId
    ? ` OR (g.subject_type = 'DEPARTMENT' AND g.subject_id = ${bind(ctx.departmentId)})`
    : "";

  const grantExists = `EXISTS (
        SELECT 1 FROM ${table} g
        WHERE g.tenant_id = ${tenantParam}
          AND g.resource_type = ${resourceTypeParam}
          AND g.resource_id = ${a}.${idColumn}
          AND (g.perms & ${permParam}) = ${permParam}
          AND (
            (g.subject_type = 'USER' AND g.subject_id = ${userParam})
            OR (g.subject_type = 'ROLE' AND g.subject_id = ANY(${rolesParam}::text[]))${departmentClause}
          )
      )`;

  const ownerClause = options.ownerColumn
    ? ` OR ${a}.${safeIdentifier(options.ownerColumn)} = ${userParam}`
    : "";

  return {
    sql: `(
      ${a}.${tenantColumn} = ${tenantParam}
      AND (
        ${superRolesParam}::text[] && ${rolesParam}::text[]
        OR ${grantExists}${ownerClause}
      )
    )`,
    values,
  };
}
