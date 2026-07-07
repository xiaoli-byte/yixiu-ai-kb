import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  DocumentBatchPermissionUpdateRequest,
  DocumentBatchOperationRequest,
  DocumentPermissionUpdateRequest,
} from "@ai-knowledge/schemas";
import { extname } from "path";
import { v4 as uuid } from "uuid";
import { PRISMA } from "../../database/database.service";
import { DatabaseService } from "../../database/database.service";
import { sha256Hex } from "../../common/dedup/canonical";
import { Neo4jService } from "../../database/neo4j/neo4j.service";
import { QueueService } from "../queue/queue.service";
import { StorageService } from "../storage/storage.service";
import {
  DocumentAccessService,
  type DocumentAccessFlags,
  type DocumentAction,
  type DocumentUserContext,
  type PermissionAuditLogInput,
} from "./document-access.service";
import { isSupportedDocumentFile, SUPPORTED_DOCUMENT_EXTENSIONS } from "./document-file-types";

type PrismaRawTransaction = {
  $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<number>;
};

type ListOptions = {
  q?: string;
  status?: string;
  folderId?: string;
  tags?: string[] | string;
  fileType?: string;
  permissionScope?: string;
  uploaderId?: string;
  departmentId?: string;
  uploadedFrom?: string;
  uploadedTo?: string;
  archived?: boolean;
  scope?: string;
  page: number;
  pageSize: number;
};

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
    private readonly neo4j: Neo4jService,
    private readonly access: DocumentAccessService,
  ) {}

  async list(opts: ListOptions, user?: any) {
    const actor = this.toDocumentUserContext(user);
    const values: unknown[] = [];
    const filters: string[] = [];
    const addValue = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (opts.status) filters.push(`d.status = ${addValue(opts.status)}`);
    if (opts.q) filters.push(`d.title ILIKE ${addValue(`%${opts.q}%`)}`);
    if (opts.folderId === "root") {
      filters.push("d.folder_id IS NULL");
    } else if (opts.folderId) {
      filters.push(`d.folder_id = ${addValue(opts.folderId)}`);
    }

    const tagIds = this.normalizeTagIds(opts.tags);
    if (tagIds.length > 0) {
      filters.push(
        `EXISTS (
          SELECT 1
          FROM document_tags dt_filter
          WHERE dt_filter.document_id = d.id
            AND dt_filter.tag_id = ANY(${addValue(tagIds)}::text[])
        )`,
      );
    }
    if (opts.fileType) filters.push(`d.mime ILIKE ${addValue(`%${opts.fileType}%`)}`);
    if (opts.permissionScope) filters.push(`d.permission_scope = ${addValue(opts.permissionScope)}`);
    if (opts.uploaderId) filters.push(`d.owner_id = ${addValue(opts.uploaderId)}`);
    if (opts.departmentId) filters.push(`u.department_id = ${addValue(opts.departmentId)}`);
    if (opts.uploadedFrom) filters.push(`d.created_at >= ${addValue(new Date(opts.uploadedFrom))}`);
    if (opts.uploadedTo) filters.push(`d.created_at <= ${addValue(new Date(opts.uploadedTo))}`);
    if (opts.scope === "mine") filters.push(`d.owner_id = ${addValue(actor.userId)}`);
    if (opts.scope === "public") filters.push("d.permission_scope IN ('PUBLIC', 'COMPANY')");
    if (opts.scope === "department") filters.push("d.permission_scope = 'DEPARTMENTS'");
    if (opts.scope === "archive") {
      filters.push("d.archived = TRUE");
    } else if (typeof opts.archived === "boolean") {
      filters.push(`d.archived = ${opts.archived ? "TRUE" : "FALSE"}`);
    } else {
      filters.push("d.archived = FALSE");
    }

    const visibility = this.access.visibleDocumentWhereSql("d", actor, values.length + 1);
    values.push(...visibility.values);
    const limitParam = addValue(opts.pageSize);
    const offsetParam = addValue((opts.page - 1) * opts.pageSize);
    const whereSql = [visibility.sql, ...filters].join("\n        AND ");

    const rows = await this.db.query<any>(
      `SELECT
         d.id,
         d.title,
         d.mime,
         d.size,
         d.status,
         d.folder_id,
         d.content_id,
         d.file_hash,
         d.content_hash,
         d.duplicate_of_document_id,
         d.dedup_reason,
         d.owner_id,
         u.name AS owner_name,
         d.permission_scope,
         d.searchable,
         d.ai_reference_enabled,
         d.archived,
         d.deleted_at,
         d.created_at,
         d.updated_at,
         COALESCE(
           jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name))
             FILTER (WHERE t.id IS NOT NULL),
           '[]'::jsonb
         ) AS tags,
         COUNT(*) OVER()::int AS total_count
       FROM documents d
       LEFT JOIN users u ON u.id = d.owner_id AND u.tenant_id = d.tenant_id
       LEFT JOIN document_tags dt ON dt.document_id = d.id
       LEFT JOIN tags t ON t.id = dt.tag_id
       WHERE ${whereSql}
       GROUP BY d.id, u.name
       ORDER BY d.created_at DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      values,
    );

    const ids = rows.map((row: any) => row.id);
    const flags = await this.access.getAccessFlags(ids, actor);

    return {
      items: rows.map((row: any) => this.mapDocumentRow(row, flags[row.id])),
      total: rows[0]?.total_count ? Number(rows[0].total_count) : 0,
      page: opts.page,
      pageSize: opts.pageSize,
    };
  }

  async getDetail(id: string, user?: any) {
    const actor = this.toDocumentUserContext(user);
    await this.access.assertDocumentAccess(id, "VIEW", actor);
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId: actor.tenantId, deletedAt: null } as any,
      include: {
        owner: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
      },
    });
    if (!doc) throw new NotFoundException("Document not found");

    const contentId = (doc as any).contentId || id;
    const chunks = await this.db.query<{ id: string; idx: number; text: string; tokens: number }>(
      `SELECT id, idx, text, tokens
       FROM chunks
       WHERE content_id = $1 OR (content_id IS NULL AND document_id = $2)
       ORDER BY idx ASC`,
      [contentId, id],
    );

    return {
      id: doc.id,
      title: doc.title,
      mime: doc.mime,
      size: Number(doc.size),
      status: doc.status,
      folderId: doc.folderId,
      contentId: (doc as any).contentId ?? null,
      fileHash: (doc as any).fileHash ?? null,
      contentHash: (doc as any).contentHash ?? null,
      duplicateOfDocumentId: (doc as any).duplicateOfDocumentId ?? null,
      dedupReason: (doc as any).dedupReason ?? null,
      ownerId: doc.ownerId,
      ownerName: doc.owner?.name,
      permissionScope: (doc as any).permissionScope ?? "PRIVATE",
      searchable: (doc as any).searchable ?? true,
      aiReferenceEnabled: (doc as any).aiReferenceEnabled ?? true,
      archived: (doc as any).archived ?? false,
      deletedAt: this.toIso((doc as any).deletedAt),
      tags: doc.tags.map((t: typeof doc.tags[number]) => ({ id: t.tag.id, name: t.tag.name })),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      errorMessage: doc.errorMessage,
      chunks: chunks.map((c) => ({ id: c.id, idx: c.idx, text: c.text, tokens: c.tokens })),
    };
  }

  async upload(file: Express.Multer.File, ownerId: string, tenantId: string, folderId?: string) {
    if (!file) throw new BadRequestException("Missing file");
    const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
    const ext = extname(originalName) || "";
    if (!isSupportedDocumentFile(file.mimetype, originalName)) {
      throw new BadRequestException(
        `Unsupported file format. Supported formats: ${SUPPORTED_DOCUMENT_EXTENSIONS.join(", ")}`,
      );
    }
    const targetFolderId = await this.normalizeAndValidateTargetFolder(folderId, tenantId);

    const fileHash = sha256Hex(file.buffer);
    const id = uuid();
    const exactDuplicate = await this.findReusableUploadByFileHash(tenantId, fileHash);
    const reusedStatus = exactDuplicate
      ? this.statusFromContentStatus(exactDuplicate.content_status)
      : "PENDING";
    const key = exactDuplicate?.storage_key || `${tenantId}/${id}${ext}`;
    if (!exactDuplicate?.storage_key) {
      await this.storage.putObject(key, file.buffer, file.mimetype);
    }

    const doc = await this.prisma.document.create({
      data: {
        id,
        tenantId,
        ownerId,
        folderId: targetFolderId,
        contentId: exactDuplicate?.content_id ?? null,
        fileHash,
        contentHash: exactDuplicate?.content_hash ?? null,
        duplicateOfDocumentId: exactDuplicate?.id ?? null,
        dedupReason: exactDuplicate ? "FILE_HASH" : null,
        title: originalName,
        mime: file.mimetype,
        size: BigInt(file.size),
        status: reusedStatus,
        storageKey: key,
      } as any,
    });

    if (targetFolderId) {
      await this.access.applyInheritedFolderPermissions(doc.id, targetFolderId, ownerId);
    }
    if (exactDuplicate?.content_id) {
      await this.refreshContentStats(exactDuplicate.content_id);
    } else {
      await this.queue.enqueueDocument({ documentId: doc.id, tenantId });
    }

    return {
      id: doc.id,
      title: doc.title,
      status: doc.status,
      contentId: (doc as any).contentId ?? exactDuplicate?.content_id ?? null,
      deduplicated: Boolean(exactDuplicate),
      dedupReason: exactDuplicate ? "FILE_HASH" : null,
      message: exactDuplicate
        ? reusedStatus === "READY"
          ? "Duplicate file detected and linked to existing parsed content."
          : "Duplicate file detected and linked to content that is still processing."
        : undefined,
    };
  }

  async assertDocumentEditAccess(id: string, user?: any) {
    const actor = this.toDocumentUserContext(user);
    await this.access.assertDocumentAccess(id, "EDIT", actor);
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId: actor.tenantId, deletedAt: null } as any,
      select: { id: true } as any,
    });
    if (!doc) throw new NotFoundException("Document not found");
  }

  async update(id: string, data: { title?: string; folderId?: string | null }, user?: any) {
    const actor = this.toDocumentUserContext(user);
    await this.access.assertDocumentAccess(id, "EDIT", actor);
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId: actor.tenantId, deletedAt: null } as any,
    });
    if (!doc) throw new NotFoundException("Document not found");
    const hasFolderId = Object.prototype.hasOwnProperty.call(data, "folderId");
    const targetFolderId = hasFolderId
      ? await this.normalizeAndValidateTargetFolder(data.folderId, actor.tenantId)
      : undefined;

    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        title: data.title,
        folderId: hasFolderId ? targetFolderId : undefined,
      },
    });
    if (targetFolderId) {
      await this.access.applyInheritedFolderPermissions(id, targetFolderId, actor.userId);
    }

    return {
      id: updated.id,
      title: updated.title,
      mime: updated.mime,
      size: Number(updated.size),
      status: updated.status,
      folderId: updated.folderId,
      ownerId: updated.ownerId,
      tenantId: updated.tenantId,
      errorMessage: updated.errorMessage,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async remove(id: string, user?: any) {
    const actor = this.toDocumentUserContext(user);
    await this.access.assertDocumentAccess(id, "DELETE", actor);
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId: actor.tenantId, deletedAt: null } as any,
    });
    if (!doc) throw new NotFoundException("Document not found");

    await this.prisma.document.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: actor.userId,
      } as any,
    });
    return { id };
  }

  async getPermissions(id: string, user?: any) {
    const actor = this.toDocumentUserContext(user);
    await this.access.assertDocumentAccess(id, "MANAGE_PERMISSION", actor);
    const snapshot = await this.readPermissionSnapshot(id, actor.tenantId);
    if (!snapshot) throw new NotFoundException("Document not found");
    return snapshot;
  }

  async setPermissions(id: string, body: unknown, user?: any) {
    const actor = this.toDocumentUserContext(user);
    const parsed = this.parseRequest(
      DocumentPermissionUpdateRequest,
      body,
      "Invalid document permission request",
    );
    await this.access.assertDocumentAccess(id, "MANAGE_PERMISSION", actor);

    return this.prisma.$transaction(async (tx) => {
      const runner = tx as unknown as PrismaRawTransaction;
      const before = await this.readPermissionSnapshot(id, actor.tenantId, runner);
      if (!before) throw new NotFoundException("Document not found");

      await runner.$executeRawUnsafe(
        `UPDATE documents
         SET permission_scope = $3,
             searchable = $4,
             ai_reference_enabled = $5,
             updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        id,
        actor.tenantId,
        parsed.permissionScope,
        parsed.searchable,
        parsed.aiReferenceEnabled,
      );

      if (parsed.mode === "OVERWRITE" || parsed.mode === "DIRECT") {
        await runner.$executeRawUnsafe(
          `DELETE FROM document_permissions WHERE document_id = $1 AND tenant_id = $2`,
          id,
          actor.tenantId,
        );
      }

      for (const entry of parsed.entries ?? []) {
        await runner.$executeRawUnsafe(
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
             created_by
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (tenant_id, document_id, subject_type, subject_id)
           DO UPDATE SET
             can_view = EXCLUDED.can_view,
             can_download = EXCLUDED.can_download,
             can_edit = EXCLUDED.can_edit,
             can_delete = EXCLUDED.can_delete,
             can_manage_permission = EXCLUDED.can_manage_permission,
             updated_at = NOW()`,
          uuid(),
          actor.tenantId,
          id,
          entry.subjectType,
          entry.subjectId,
          entry.canView,
          entry.canDownload,
          entry.canEdit,
          entry.canDelete,
          entry.canManagePermission,
          actor.userId,
        );
      }

      const after = await this.readPermissionSnapshot(id, actor.tenantId, runner);
      await this.writePermissionAuditLog(runner, {
        tenantId: actor.tenantId,
        actorId: actor.userId,
        targetType: "DOCUMENT",
        targetId: id,
        action: "PERMISSION_UPDATE",
        mode: parsed.mode,
        before,
        after,
      });

      return after;
    });
  }

  async setBatchPermissions(body: unknown, user?: any) {
    const parsed = this.parseRequest(
      DocumentBatchPermissionUpdateRequest,
      body,
      "Invalid batch permission request",
    );
    const { documentIds, ...permissionBody } = parsed;
    const results = [];
    for (const documentId of documentIds) {
      try {
        await this.setPermissions(documentId, permissionBody, user);
        results.push({ documentId, ok: true });
      } catch (error: any) {
        results.push({ documentId, ok: false, message: error?.message || "Failed" });
      }
    }
    return { results };
  }

  async batch(body: unknown, user?: any) {
    const parsed = this.parseRequest(
      DocumentBatchOperationRequest,
      body,
      "Invalid document batch request",
    );
    const results = [];
    for (const documentId of parsed.documentIds) {
      try {
        await this.applyBatchAction(documentId, parsed, user);
        results.push({ documentId, ok: true });
      } catch (error: any) {
        results.push({ documentId, ok: false, message: error?.message || "Failed" });
      }
    }
    return { action: parsed.action, results };
  }

  async retryParse(id: string, user?: any) {
    const actor = this.toDocumentUserContext(user);
    await this.access.assertDocumentAccess(id, "EDIT", actor);
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId: actor.tenantId, deletedAt: null } as any,
    });
    if (!doc) throw new NotFoundException("Document not found");
    if (doc.status !== "FAILED") {
      throw new BadRequestException("Only FAILED documents can be retried");
    }

    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        status: "PENDING",
        errorMessage: null,
      } as any,
    });
    await this.queue.enqueueDocument({ documentId: id, tenantId: actor.tenantId });
    return { id: updated.id, status: updated.status };
  }

  private statusFromContentStatus(status: string | null | undefined) {
    if (status === "READY") return "READY";
    if (status === "PARSING" || status === "CHUNKING" || status === "EMBEDDING") return status;
    if (status === "FAILED") return "FAILED";
    return "PENDING";
  }

  private async findReusableUploadByFileHash(tenantId: string, fileHash: string) {
    return this.db.queryOne<{
      id: string;
      content_id: string;
      content_hash: string;
      storage_key: string | null;
      content_status: string | null;
    }>(
      `SELECT d.id, d.content_id, d.content_hash, d.storage_key, dc.status AS content_status
       FROM documents d
       LEFT JOIN document_contents dc ON dc.id = d.content_id
       WHERE d.tenant_id = $1
         AND d.file_hash = $2
         AND d.content_id IS NOT NULL
         AND d.deleted_at IS NULL
         AND COALESCE(dc.status, d.status) <> 'FAILED'
       ORDER BY d.created_at ASC
       LIMIT 1`,
      [tenantId, fileHash],
    );
  }

  private async refreshContentStats(contentId: string) {
    await this.db.query(
      `UPDATE document_contents dc
       SET duplicate_count = stats.upload_count,
           source_count = stats.upload_count,
           updated_at = NOW()
       FROM (
         SELECT content_id, COUNT(*)::int AS upload_count
         FROM documents
         WHERE content_id = $1 AND deleted_at IS NULL
         GROUP BY content_id
       ) stats
       WHERE dc.id = stats.content_id`,
      [contentId],
    );
  }

  private async applyBatchAction(
    documentId: string,
    parsed: DocumentBatchOperationRequest,
    user?: any,
  ) {
    if (parsed.action === "DOWNLOAD") {
      throw new BadRequestException("Batch download is not supported yet");
    }

    const actor = this.toDocumentUserContext(user);
    if (parsed.action === "DELETE") {
      await this.remove(documentId, user);
      return;
    }

    await this.access.assertDocumentAccess(documentId, this.batchAccessAction(parsed.action), actor);
    if (parsed.action === "ARCHIVE") {
      await this.prisma.document.update({
        where: { id: documentId },
        data: { archived: true, updatedAt: new Date() } as any,
      });
      return;
    }
    if (parsed.action === "RESTORE") {
      await this.prisma.document.update({
        where: { id: documentId },
        data: { archived: false, updatedAt: new Date() } as any,
      });
      return;
    }
    if (parsed.action === "MOVE") {
      if (!parsed.folderId) throw new BadRequestException("folderId is required");
      const targetFolderId = await this.normalizeAndValidateTargetFolder(
        parsed.folderId,
        actor.tenantId,
      );
      await this.prisma.document.update({
        where: { id: documentId },
        data: { folderId: targetFolderId, updatedAt: new Date() } as any,
      });
      if (targetFolderId) {
        await this.access.applyInheritedFolderPermissions(documentId, targetFolderId, actor.userId);
      }
    }
  }

  private batchAccessAction(action: DocumentBatchOperationRequest["action"]): DocumentAction {
    if (action === "DOWNLOAD") return "DOWNLOAD";
    return "EDIT";
  }

  private async readPermissionSnapshot(
    documentId: string,
    tenantId: string,
    tx?: PrismaRawTransaction,
  ) {
    const documents = await this.queryRows<any>(
      `SELECT id, permission_scope, searchable, ai_reference_enabled
       FROM documents
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [documentId, tenantId],
      tx,
    );
    const document = documents[0] ?? null;
    if (!document) return null;

    const entries = await this.queryRows<any>(
      `SELECT subject_type, subject_id, can_view, can_download, can_edit, can_delete, can_manage_permission
       FROM document_permissions
       WHERE document_id = $1 AND tenant_id = $2
       ORDER BY subject_type ASC, subject_id ASC`,
      [documentId, tenantId],
      tx,
    );

    return {
      documentId,
      permissionScope: document.permission_scope,
      searchable: document.searchable,
      aiReferenceEnabled: document.ai_reference_enabled,
      entries: entries.map((entry: any) => ({
        subjectType: entry.subject_type,
        subjectId: entry.subject_id,
        canView: Boolean(entry.can_view),
        canDownload: Boolean(entry.can_download),
        canEdit: Boolean(entry.can_edit),
        canDelete: Boolean(entry.can_delete),
        canManagePermission: Boolean(entry.can_manage_permission),
      })),
    };
  }

  private async queryRows<T>(
    sql: string,
    params: unknown[],
    tx?: PrismaRawTransaction,
  ): Promise<T[]> {
    if (tx) {
      return (await tx.$queryRawUnsafe<T[]>(sql, ...params)) as T[];
    }
    return this.db.query<T>(sql, params);
  }

  private async writePermissionAuditLog(
    tx: PrismaRawTransaction,
    input: PermissionAuditLogInput,
  ) {
    await tx.$executeRawUnsafe(
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
      uuid(),
      input.tenantId,
      input.actorId ?? null,
      input.targetType,
      input.targetId,
      input.action,
      input.mode ?? "DIRECT",
      JSON.stringify(input.before ?? null),
      JSON.stringify(input.after ?? null),
    );
  }

  private parseRequest<T>(schema: z.ZodType<T>, body: unknown, message: string): T {
    const result = schema.safeParse(body);
    if (!result.success) throw new BadRequestException(message);
    return result.data;
  }

  private async normalizeAndValidateTargetFolder(
    folderId: string | null | undefined,
    tenantId: string,
  ) {
    const normalized = typeof folderId === "string" ? folderId.trim() : folderId;
    if (!normalized || normalized === "root") return null;

    const folder = await this.prisma.folder.findFirst({
      where: { id: normalized, tenantId } as any,
      select: { id: true },
    });
    if (!folder) throw new BadRequestException("Folder not found");
    return normalized;
  }

  private toDocumentUserContext(user?: any): DocumentUserContext {
    return {
      userId: user?.sub ?? user?.userId ?? user?.id ?? this.db.userId!,
      tenantId: user?.tenantId ?? this.db.tenantId!,
      role: user?.role ?? (this.db as any).role ?? "viewer",
      departmentId: user?.departmentId ?? null,
    };
  }

  private normalizeTagIds(tags?: string[] | string) {
    if (!tags) return [];
    if (Array.isArray(tags)) return tags.filter((tag) => tag.length > 0);
    return tags.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  }

  private mapDocumentRow(row: any, flags?: DocumentAccessFlags) {
    return {
      id: row.id,
      title: row.title,
      mime: row.mime,
      size: Number(row.size),
      status: row.status,
      folderId: row.folder_id ?? row.folderId ?? null,
      contentId: row.content_id ?? row.contentId ?? null,
      fileHash: row.file_hash ?? row.fileHash ?? null,
      contentHash: row.content_hash ?? row.contentHash ?? null,
      duplicateOfDocumentId: row.duplicate_of_document_id ?? row.duplicateOfDocumentId ?? null,
      dedupReason: row.dedup_reason ?? row.dedupReason ?? null,
      ownerId: row.owner_id ?? row.ownerId,
      ownerName: row.owner_name ?? row.ownerName,
      permissionScope: row.permission_scope ?? row.permissionScope ?? "PRIVATE",
      searchable: row.searchable ?? true,
      aiReferenceEnabled: row.ai_reference_enabled ?? row.aiReferenceEnabled ?? true,
      archived: row.archived ?? false,
      deletedAt: this.toIso(row.deleted_at ?? row.deletedAt),
      canView: flags?.canView ?? false,
      canDownload: flags?.canDownload ?? false,
      canEdit: flags?.canEdit ?? false,
      canDelete: flags?.canDelete ?? false,
      canManagePermission: flags?.canManagePermission ?? false,
      tags: Array.isArray(row.tags) ? row.tags : [],
      createdAt: this.toIso(row.created_at ?? row.createdAt)!,
      updatedAt: this.toIso(row.updated_at ?? row.updatedAt)!,
    };
  }

  private toIso(value: any) {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value?.toISOString === "function") return value.toISOString();
    return String(value);
  }
}
