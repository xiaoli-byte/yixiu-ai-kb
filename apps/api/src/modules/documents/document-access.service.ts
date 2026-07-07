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

  visibleDocumentWhereSql(alias: string, user: DocumentUserContext): SqlFragment {
    const documentAlias = this.safeAlias(alias);
    const values: unknown[] = [user.tenantId, user.userId, user.role];
    const permissionGrantPaths = [
      `(dp.subject_type = 'USER' AND dp.subject_id = $2)`,
      `(dp.subject_type = 'ROLE' AND dp.subject_id = $3)`,
    ];

    if (user.departmentId) {
      values.push(user.departmentId);
      permissionGrantPaths.push(`(dp.subject_type = 'DEPARTMENT' AND dp.subject_id = $4)`);
    }

    return {
      sql: `(
        ${documentAlias}.tenant_id = $1
        AND ${documentAlias}.deleted_at IS NULL
        AND (
          $3 = 'super_admin'
          OR ${documentAlias}.owner_id = $2
          OR ${documentAlias}.permission_scope IN ('COMPANY', 'PUBLIC')
          OR ($3 = 'admin' AND ${documentAlias}.permission_scope = 'ADMIN')
          OR EXISTS (
            SELECT 1
            FROM document_permissions dp
            WHERE dp.tenant_id = ${documentAlias}.tenant_id
              AND dp.document_id = ${documentAlias}.id
              AND dp.can_view = TRUE
              AND (${permissionGrantPaths.join(" OR ")})
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
  ): Promise<boolean> {
    if (this.isSuperAdmin(user)) return true;

    const flags = await this.getAccessFlags([documentId], user);
    return flags[documentId]?.[this.flagForAction(action)] ?? false;
  }

  async getAccessFlags(
    documentIds: string[],
    user: DocumentUserContext,
  ): Promise<Record<string, DocumentAccessFlags>> {
    const result = Object.fromEntries(
      documentIds.map((documentId) => [documentId, this.emptyFlags()]),
    ) as Record<string, DocumentAccessFlags>;

    if (documentIds.length === 0) return result;
    if (this.isSuperAdmin(user)) {
      for (const documentId of documentIds) {
        result[documentId] = this.fullFlags();
      }
      return result;
    }

    const rows = await this.db.query<DocumentAccessRow>(
      `WITH grant_flags AS (
         SELECT
           dp.document_id,
           BOOL_OR(dp.can_view) AS can_view,
           BOOL_OR(dp.can_download) AS can_download,
           BOOL_OR(dp.can_edit) AS can_edit,
           BOOL_OR(dp.can_delete) AS can_delete,
           BOOL_OR(dp.can_manage_permission) AS can_manage_permission
         FROM document_permissions dp
         WHERE dp.tenant_id = $2
           AND dp.document_id = ANY($1::text[])
           AND (
             (dp.subject_type = 'USER' AND dp.subject_id = $3)
             OR (dp.subject_type = 'ROLE' AND dp.subject_id = $4)
             OR ($5::text IS NOT NULL AND dp.subject_type = 'DEPARTMENT' AND dp.subject_id = $5)
           )
         GROUP BY dp.document_id
       )
       SELECT
         d.id AS document_id,
         (
           d.owner_id = $3
           OR d.permission_scope IN ('COMPANY', 'PUBLIC')
           OR ($4 = 'admin' AND d.permission_scope = 'ADMIN')
           OR COALESCE(g.can_view, FALSE)
         ) AS can_view,
         (d.owner_id = $3 OR COALESCE(g.can_download, FALSE)) AS can_download,
         (d.owner_id = $3 OR COALESCE(g.can_edit, FALSE)) AS can_edit,
         (d.owner_id = $3 OR COALESCE(g.can_delete, FALSE)) AS can_delete,
         (
           d.owner_id = $3
           OR ($4 = 'admin' AND d.permission_scope = 'ADMIN')
           OR COALESCE(g.can_manage_permission, FALSE)
         ) AS can_manage_permission
       FROM documents d
       LEFT JOIN grant_flags g ON g.document_id = d.id
       WHERE d.tenant_id = $2
         AND d.deleted_at IS NULL
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
  ): Promise<void> {
    if (!(await this.canAccessDocument(documentId, action, user))) {
      throw new ForbiddenException("Document access denied");
    }
  }

  async applyInheritedFolderPermissions(
    documentId: string,
    folderId: string,
    actorId: string,
  ): Promise<void> {
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
         ORDER BY fp.updated_at DESC
         LIMIT 1
       ) inherited
       WHERE d.id = $1
         AND d.tenant_id = inherited.tenant_id`,
      [documentId, folderId],
    );

    await this.db.query(
      `INSERT INTO document_permissions (
         id,
         tenant_id,
         document_id,
         subject_type,
         subject_id,
         can_view,
         can_download,
         can_edit,
         can_delete,
         can_manage_permission,
         created_by,
         created_at,
         updated_at
       )
       SELECT
         'dp_' || md5($1 || ':' || fp.subject_type || ':' || fp.subject_id),
         fp.tenant_id,
         $1,
         fp.subject_type,
         fp.subject_id,
         fp.can_view,
         fp.can_download,
         fp.can_edit,
         fp.can_delete,
         fp.can_manage_permission,
         $3,
         NOW(),
         NOW()
       FROM folder_permissions fp
       INNER JOIN documents d ON d.id = $1 AND d.tenant_id = fp.tenant_id
       WHERE fp.folder_id = $2
       ON CONFLICT ON CONSTRAINT document_permissions_tenant_document_subject_unique
       DO UPDATE SET
         can_view = EXCLUDED.can_view,
         can_download = EXCLUDED.can_download,
         can_edit = EXCLUDED.can_edit,
         can_delete = EXCLUDED.can_delete,
         can_manage_permission = EXCLUDED.can_manage_permission,
         updated_at = NOW()`,
      [documentId, folderId, actorId],
    );
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

  private fullFlags(): DocumentAccessFlags {
    return {
      canView: true,
      canDownload: true,
      canEdit: true,
      canDelete: true,
      canManagePermission: true,
    };
  }

  private isSuperAdmin(user: DocumentUserContext): boolean {
    return user.role === "super_admin";
  }

  private safeAlias(alias: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
      throw new Error("Invalid SQL alias");
    }
    return alias;
  }
}
