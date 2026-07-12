import { ForbiddenException, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { DatabaseService } from "../../database/database.service";

export type DocumentAction = "VIEW" | "DOWNLOAD" | "EDIT" | "DELETE" | "MANAGE_PERMISSION";

export interface DocumentUserContext {
  userId: string;
  tenantId: string;
  role: string;
  departmentId?: string | null;
}

export interface SqlFragment {
  sql: string;
  values: unknown[];
}

export interface DocumentAccessFlags {
  canView: boolean;
  canDownload: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManagePermission: boolean;
}

export interface PermissionAuditLogInput {
  tenantId: string;
  actorId?: string | null;
  targetType: "DOCUMENT" | "FOLDER" | string;
  targetId: string;
  action: string;
  mode?: "DIRECT" | "INHERITED" | string;
  before?: unknown;
  after?: unknown;
}

type DocumentAccessRow = {
  document_id: string;
  can_view: boolean;
  can_download: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_manage_permission: boolean;
};

@Injectable()
export class DocumentAccessService {
  constructor(private readonly db: DatabaseService) {}

  visibleDocumentWhereSql(
    alias: string,
    user: DocumentUserContext,
    startIndex = 1,
    includeDeleted = false,
  ): SqlFragment {
    const documentAlias = this.safeAlias(alias);
    const tenantParam = this.placeholder(startIndex);
    const userParam = this.placeholder(startIndex + 1);
    const roleParam = this.placeholder(startIndex + 2);
    const values: unknown[] = [user.tenantId, user.userId, user.role];
    const grantExpressions = [
      `(SELECT doc_user.can_view
            FROM document_permissions doc_user
            WHERE doc_user.tenant_id = ${documentAlias}.tenant_id
              AND doc_user.document_id = ${documentAlias}.id
              AND doc_user.subject_type = 'USER'
              AND doc_user.subject_id = ${userParam}
            LIMIT 1)`,
    ];

    let departmentParam: string | null = null;
    if (user.departmentId) {
      departmentParam = this.placeholder(startIndex + 3);
      values.push(user.departmentId);
      grantExpressions.push(
        `(SELECT doc_dept.can_view
            FROM document_permissions doc_dept
            WHERE doc_dept.tenant_id = ${documentAlias}.tenant_id
              AND doc_dept.document_id = ${documentAlias}.id
              AND doc_dept.subject_type = 'DEPARTMENT'
              AND doc_dept.subject_id = ${departmentParam}
            LIMIT 1)`,
      );
    }

    grantExpressions.push(
      `(SELECT doc_role.can_view
          FROM document_permissions doc_role
          WHERE doc_role.tenant_id = ${documentAlias}.tenant_id
            AND doc_role.document_id = ${documentAlias}.id
            AND doc_role.subject_type = 'ROLE'
            AND doc_role.subject_id = ${roleParam}
          LIMIT 1)`,
      `(SELECT folder_user.can_view
          FROM folder_permissions folder_user
          WHERE folder_user.tenant_id = ${documentAlias}.tenant_id
            AND folder_user.folder_id = ${documentAlias}.folder_id
            AND folder_user.subject_type = 'USER'
            AND folder_user.subject_id = ${userParam}
          LIMIT 1)`,
    );

    if (departmentParam) {
      grantExpressions.push(
        `(SELECT folder_dept.can_view
            FROM folder_permissions folder_dept
            WHERE folder_dept.tenant_id = ${documentAlias}.tenant_id
              AND folder_dept.folder_id = ${documentAlias}.folder_id
              AND folder_dept.subject_type = 'DEPARTMENT'
              AND folder_dept.subject_id = ${departmentParam}
            LIMIT 1)`,
      );
    }

    grantExpressions.push(
      `(SELECT folder_role.can_view
          FROM folder_permissions folder_role
          WHERE folder_role.tenant_id = ${documentAlias}.tenant_id
            AND folder_role.folder_id = ${documentAlias}.folder_id
            AND folder_role.subject_type = 'ROLE'
            AND folder_role.subject_id = ${roleParam}
          LIMIT 1)`,
      `((${documentAlias}.owner_id = ${userParam} AND ${documentAlias}.permission_scope <> 'ADMIN') OR ${documentAlias}.permission_scope IN ('COMPANY', 'PUBLIC'))`,
    );

    const deletedCondition = includeDeleted ? "" : `AND ${documentAlias}.deleted_at IS NULL`;

    return {
      sql: `(
        ${documentAlias}.tenant_id = ${tenantParam}
        ${deletedCondition}
        AND (
          ${roleParam} = ANY(ARRAY['super_admin', 'admin'])
          OR (
            ${documentAlias}.permission_scope <> 'ADMIN'
            AND COALESCE(${grantExpressions.join(", ")}) = TRUE
          )
        )
      )`,
      values,
    };
  }

  async canAccessDocument(
    documentId: string,
    action: DocumentAction,
    user: DocumentUserContext,
    includeDeleted = false,
  ): Promise<boolean> {
    const flags = await this.getAccessFlags([documentId], user, includeDeleted);
    return flags[documentId]?.[this.flagForAction(action)] ?? false;
  }

  async getAccessFlags(
    documentIds: string[],
    user: DocumentUserContext,
    includeDeleted = false,
  ): Promise<Record<string, DocumentAccessFlags>> {
    const result = Object.fromEntries(
      documentIds.map((documentId) => [documentId, this.emptyFlags()]),
    ) as Record<string, DocumentAccessFlags>;

    if (documentIds.length === 0) return result;

    const rows = await this.db.query<DocumentAccessRow>(
      `SELECT
         d.id AS document_id,
         CASE
           WHEN $4 = ANY(ARRAY['super_admin', 'admin']) THEN TRUE
           WHEN d.permission_scope = 'ADMIN' THEN FALSE
           ELSE COALESCE(
             doc_user.can_view,
             doc_dept.can_view,
             doc_role.can_view,
             folder_user.can_view,
             folder_dept.can_view,
             folder_role.can_view,
             (d.owner_id = $3 AND d.permission_scope <> 'ADMIN') OR d.permission_scope IN ('COMPANY', 'PUBLIC')
           )
         END AS can_view,
         CASE
           WHEN $4 = ANY(ARRAY['super_admin', 'admin']) THEN TRUE
           WHEN d.permission_scope = 'ADMIN' THEN FALSE
           ELSE COALESCE(doc_user.can_download, doc_dept.can_download, doc_role.can_download, folder_user.can_download, folder_dept.can_download, folder_role.can_download, FALSE)
         END AS can_download,
         CASE
           WHEN $4 = ANY(ARRAY['super_admin', 'admin']) THEN TRUE
           WHEN d.permission_scope = 'ADMIN' THEN FALSE
           ELSE COALESCE(doc_user.can_edit, doc_dept.can_edit, doc_role.can_edit, folder_user.can_edit, folder_dept.can_edit, folder_role.can_edit, FALSE)
         END AS can_edit,
         CASE
           WHEN $4 = ANY(ARRAY['super_admin', 'admin']) THEN TRUE
           WHEN d.permission_scope = 'ADMIN' THEN FALSE
           ELSE COALESCE(doc_user.can_delete, doc_dept.can_delete, doc_role.can_delete, folder_user.can_delete, folder_dept.can_delete, folder_role.can_delete, FALSE)
         END AS can_delete,
         CASE
           WHEN $4 = ANY(ARRAY['super_admin', 'admin']) THEN TRUE
           WHEN d.permission_scope = 'ADMIN' THEN FALSE
           ELSE COALESCE(doc_user.can_manage_permission, doc_dept.can_manage_permission, doc_role.can_manage_permission, folder_user.can_manage_permission, folder_dept.can_manage_permission, folder_role.can_manage_permission, FALSE)
         END AS can_manage_permission
       FROM documents d
       LEFT JOIN LATERAL (
         SELECT
           doc_user.can_view,
           doc_user.can_download,
           doc_user.can_edit,
           doc_user.can_delete,
           doc_user.can_manage_permission
         FROM document_permissions doc_user
         WHERE doc_user.tenant_id = d.tenant_id
           AND doc_user.document_id = d.id
           AND doc_user.subject_type = 'USER'
           AND doc_user.subject_id = $3
         LIMIT 1
       ) doc_user ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           doc_dept.can_view,
           doc_dept.can_download,
           doc_dept.can_edit,
           doc_dept.can_delete,
           doc_dept.can_manage_permission
         FROM document_permissions doc_dept
         WHERE doc_dept.tenant_id = d.tenant_id
           AND doc_dept.document_id = d.id
           AND doc_dept.subject_type = 'DEPARTMENT'
           AND doc_dept.subject_id = $5
           AND $5::text IS NOT NULL
         LIMIT 1
       ) doc_dept ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           doc_role.can_view,
           doc_role.can_download,
           doc_role.can_edit,
           doc_role.can_delete,
           doc_role.can_manage_permission
         FROM document_permissions doc_role
         WHERE doc_role.tenant_id = d.tenant_id
           AND doc_role.document_id = d.id
           AND doc_role.subject_type = 'ROLE'
           AND doc_role.subject_id = $4
         LIMIT 1
       ) doc_role ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           folder_user.can_view,
           folder_user.can_download,
           folder_user.can_edit,
           folder_user.can_delete,
           folder_user.can_manage_permission
         FROM folder_permissions folder_user
         WHERE folder_user.tenant_id = d.tenant_id
           AND folder_user.folder_id = d.folder_id
           AND folder_user.subject_type = 'USER'
           AND folder_user.subject_id = $3
         LIMIT 1
       ) folder_user ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           folder_dept.can_view,
           folder_dept.can_download,
           folder_dept.can_edit,
           folder_dept.can_delete,
           folder_dept.can_manage_permission
         FROM folder_permissions folder_dept
         WHERE folder_dept.tenant_id = d.tenant_id
           AND folder_dept.folder_id = d.folder_id
           AND folder_dept.subject_type = 'DEPARTMENT'
           AND folder_dept.subject_id = $5
           AND $5::text IS NOT NULL
         LIMIT 1
       ) folder_dept ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           folder_role.can_view,
           folder_role.can_download,
           folder_role.can_edit,
           folder_role.can_delete,
           folder_role.can_manage_permission
         FROM folder_permissions folder_role
         WHERE folder_role.tenant_id = d.tenant_id
           AND folder_role.folder_id = d.folder_id
           AND folder_role.subject_type = 'ROLE'
           AND folder_role.subject_id = $4
         LIMIT 1
       ) folder_role ON TRUE
       WHERE d.tenant_id = $2
         ${includeDeleted ? "" : "AND d.deleted_at IS NULL"}
         AND d.id = ANY($1::text[])`,
      [documentIds, user.tenantId, user.userId, user.role, user.departmentId ?? null],
    );

    for (const row of rows) {
      result[row.document_id] = this.flagsFromRow(row);
    }

    return result;
  }

  async assertDocumentAccess(
    documentId: string,
    action: DocumentAction,
    user: DocumentUserContext,
    includeDeleted = false,
  ): Promise<void> {
    if (!(await this.canAccessDocument(documentId, action, user, includeDeleted))) {
      throw new ForbiddenException("Document access denied");
    }
  }

  async applyInheritedFolderPermissions(
    documentId: string,
    folderId: string,
    actorId: string,
  ): Promise<void> {
    const tenantId = this.db.tenantId;
    if (!tenantId) {
      throw new Error("Tenant context required to apply inherited folder permissions");
    }

    await this.db.query(
      `UPDATE documents d
       SET permission_scope = inherited.permission_scope,
           searchable = inherited.searchable,
           ai_reference_enabled = inherited.ai_reference_enabled,
           updated_at = NOW()
       FROM (
         SELECT fp.tenant_id, fp.permission_scope, fp.searchable, fp.ai_reference_enabled
         FROM folder_permissions fp
         WHERE fp.folder_id = $2
           AND fp.tenant_id = $3
         ORDER BY fp.updated_at DESC
         LIMIT 1
       ) inherited
       WHERE d.id = $1
         AND d.folder_id = $2
         AND d.tenant_id = $3
         AND d.tenant_id = inherited.tenant_id
         AND d.deleted_at IS NULL`,
      [documentId, folderId, tenantId],
    );

    await this.writeAuditLog({
      tenantId,
      actorId,
      targetType: "DOCUMENT",
      targetId: documentId,
      action: "FOLDER_INHERIT",
      mode: "INHERITED",
      after: { folderId },
    });
  }

  async writeAuditLog(input: PermissionAuditLogInput): Promise<void> {
    await this.db.query(
      `INSERT INTO permission_audit_logs (
         id,
         tenant_id,
         actor_id,
         target_type,
         target_id,
         action,
         mode,
         before,
         after
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
      [
        randomUUID(),
        input.tenantId,
        input.actorId ?? null,
        input.targetType,
        input.targetId,
        input.action,
        input.mode ?? "DIRECT",
        JSON.stringify(input.before ?? null),
        JSON.stringify(input.after ?? null),
      ],
    );
  }

  private flagForAction(action: DocumentAction): keyof DocumentAccessFlags {
    const actionMap: Record<DocumentAction, keyof DocumentAccessFlags> = {
      VIEW: "canView",
      DOWNLOAD: "canDownload",
      EDIT: "canEdit",
      DELETE: "canDelete",
      MANAGE_PERMISSION: "canManagePermission",
    };
    return actionMap[action];
  }

  private flagsFromRow(row: DocumentAccessRow): DocumentAccessFlags {
    return {
      canView: Boolean(row.can_view),
      canDownload: Boolean(row.can_download),
      canEdit: Boolean(row.can_edit),
      canDelete: Boolean(row.can_delete),
      canManagePermission: Boolean(row.can_manage_permission),
    };
  }

  private emptyFlags(): DocumentAccessFlags {
    return {
      canView: false,
      canDownload: false,
      canEdit: false,
      canDelete: false,
      canManagePermission: false,
    };
  }

  private placeholder(index: number): string {
    if (!Number.isInteger(index) || index < 1) {
      throw new Error("Invalid SQL placeholder start index");
    }
    return `$${index}`;
  }

  private safeAlias(alias: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
      throw new Error("Invalid SQL alias");
    }
    return alias;
  }
}
