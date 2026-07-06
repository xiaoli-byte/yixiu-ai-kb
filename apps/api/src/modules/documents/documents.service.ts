import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PRISMA } from "../../database/database.service";
import { DatabaseService } from "../../database/database.service";
import { StorageService } from "../storage/storage.service";
import { QueueService } from "../queue/queue.service";
import { Neo4jService } from "../../database/neo4j/neo4j.service";
import { v4 as uuid } from "uuid";
import { extname } from "path";
import { isSupportedDocumentFile, SUPPORTED_DOCUMENT_EXTENSIONS } from "./document-file-types";
import { sha256Hex } from "../../common/dedup/canonical";

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
    private readonly neo4j: Neo4jService,
  ) {}

  async list(opts: {
    q?: string;
    status?: string;
    folderId?: string;
    tags?: string[];
    page: number;
    pageSize: number;
  }) {
    const tenantId = this.db.tenantId!;
    const where: any = { tenantId };
    if (opts.status) where.status = opts.status;
    if (opts.q) where.title = { contains: opts.q, mode: "insensitive" };
    if (opts.folderId === "root") {
      where.folderId = null;
    } else if (opts.folderId) {
      where.folderId = opts.folderId;
    }
    if (opts.tags && opts.tags.length > 0) {
      where.tags = {
        some: {
          tag: {
            id: { in: opts.tags },
          },
        },
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        include: {
          owner: { select: { id: true, name: true } },
          tags: { include: { tag: true } },
        },
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      items: items.map((d: typeof items[number]) => ({
        id: d.id,
        title: d.title,
        mime: d.mime,
        size: Number(d.size),
        status: d.status,
        folderId: d.folderId,
        contentId: (d as any).contentId ?? null,
        fileHash: (d as any).fileHash ?? null,
        contentHash: (d as any).contentHash ?? null,
        duplicateOfDocumentId: (d as any).duplicateOfDocumentId ?? null,
        dedupReason: (d as any).dedupReason ?? null,
        ownerId: d.ownerId,
        ownerName: d.owner?.name,
        tags: d.tags.map((t: typeof d.tags[number]) => ({ id: t.tag.id, name: t.tag.name })),
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      })),
      total,
      page: opts.page,
      pageSize: opts.pageSize,
    };
  }

  async getDetail(id: string) {
    const tenantId = this.db.tenantId!;
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId },
      include: {
        owner: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
      },
    });
    if (!doc) throw new NotFoundException("文档不存在");
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
      tags: doc.tags.map((t: typeof doc.tags[number]) => ({ id: t.tag.id, name: t.tag.name })),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      errorMessage: doc.errorMessage,
      chunks: chunks.map((c) => ({ id: c.id, idx: c.idx, text: c.text, tokens: c.tokens })),
    };
  }

  async upload(file: Express.Multer.File, ownerId: string, tenantId: string, folderId?: string) {
    if (!file) throw new BadRequestException("缺少文件");
    // multer/FileInterceptor 默认用 latin1 解码 multipart 的 originalname,中文会被破坏。
    // 把字节当 latin1 还原成 Buffer,再按 utf8 解码,英文文件名不受影响。
    const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
    const ext = extname(originalName) || "";
    if (!isSupportedDocumentFile(file.mimetype, originalName)) {
      throw new BadRequestException(
        `暂不支持该文件格式。支持格式：${SUPPORTED_DOCUMENT_EXTENSIONS.join(", ")}`,
      );
    }
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
        folderId: folderId || null,
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
          ? "检测到完全相同文件，已关联已有知识内容，未重复解析/切分/抽取图谱"
          : "检测到完全相同文件，已关联正在处理的知识内容，处理完成后会自动就绪"
        : undefined,
    };
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
         WHERE content_id = $1
         GROUP BY content_id
       ) stats
       WHERE dc.id = stats.content_id`,
      [contentId],
    );
  }

  async update(id: string, data: { title?: string; folderId?: string | null }) {
    const tenantId = this.db.tenantId!;
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId },
    });
    if (!doc) throw new NotFoundException("文档不存在");

    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        title: data.title,
        folderId: data.folderId,
      },
    });

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

  async remove(id: string) {
    const tenantId = this.db.tenantId!;
    const doc = await this.prisma.document.findFirst({ where: { id, tenantId } });
    if (!doc) throw new NotFoundException("文档不存在");
    const contentId = (doc as any).contentId as string | null | undefined;
    if (contentId) {
      const replacement = await this.db.queryOne<{ id: string }>(
        `SELECT id
         FROM documents
         WHERE tenant_id = $1 AND content_id = $2 AND id <> $3
         ORDER BY created_at ASC
         LIMIT 1`,
        [tenantId, contentId, id],
      );

      if (replacement) {
        await this.db.query(
          `UPDATE chunks SET document_id = $1 WHERE document_id = $2 AND content_id = $3`,
          [replacement.id, id, contentId],
        );
        await this.db.query(
          `UPDATE structured_facts SET document_id = $1 WHERE document_id = $2 AND content_id = $3`,
          [replacement.id, id, contentId],
        );
        await this.db.query(
          `UPDATE edge_evidences SET document_id = $1 WHERE document_id = $2 AND document_content_id = $3`,
          [replacement.id, id, contentId],
        );
        await this.db.query(
          `UPDATE documents
           SET duplicate_of_document_id = CASE WHEN id = $1 THEN NULL ELSE $1 END,
               dedup_reason = CASE WHEN id = $1 THEN NULL ELSE dedup_reason END,
               updated_at = NOW()
           WHERE tenant_id = $2
             AND content_id = $3
             AND (id = $1 OR duplicate_of_document_id = $4)`,
          [replacement.id, tenantId, contentId, id],
        );
        await this.db.query(
          `UPDATE document_contents
           SET canonical_document_id = $1, updated_at = NOW()
           WHERE id = $2 AND canonical_document_id = $3`,
          [replacement.id, contentId, id],
        );
      }

      await this.prisma.document.delete({ where: { id } });

      if (replacement) {
        await this.refreshContentStats(contentId);
        await this.neo4j.run(
          `MATCH (d:Document {id:$contentId, tenantId:$tenantId})
           SET d.canonicalDocumentId=$canonicalDocumentId,
               d.updatedAt=$updatedAt`,
          {
            contentId,
            tenantId,
            canonicalDocumentId: replacement.id,
            updatedAt: new Date().toISOString(),
          },
        ).catch((error: any) => this.logger.warn(`更新图谱 canonical 文档失败: ${error.message}`));
      } else {
        await this.removeGraphData(contentId, tenantId);
        await this.db.query(`DELETE FROM document_contents WHERE id = $1`, [contentId]);
      }

      await this.removeStorageObjectIfUnreferenced(doc.storageKey);
      return { id };
    }

    await this.prisma.document.delete({ where: { id } });
    await this.removeGraphData(id, tenantId);
    await this.removeStorageObjectIfUnreferenced(doc.storageKey);
    return { id };
  }

  private async removeStorageObjectIfUnreferenced(storageKey: string | null | undefined) {
    if (!storageKey) return;
    const row = await this.db.queryOne<{ count: string | number }>(
      `SELECT COUNT(*) AS count FROM documents WHERE storage_key = $1`,
      [storageKey],
    );
    if (Number(row?.count || 0) === 0) {
      await this.storage.removeObject(storageKey).catch(() => undefined);
    }
  }

  private async removeGraphData(documentId: string, tenantId: string) {
    try {
      await this.neo4j.run(
        `MATCH (:Document {id:$documentId, tenantId:$tenantId})-[:HAS_CHUNK]->(chunk:Chunk)
         DETACH DELETE chunk`,
        { documentId, tenantId },
      );
      await this.neo4j.run(
        `MATCH (d:Document {id:$documentId, tenantId:$tenantId})
         DETACH DELETE d`,
        { documentId, tenantId },
      );
      await this.neo4j.run(
        `MATCH (entity:Entity)
         WHERE (entity.tenantId = $tenantId OR (entity.tenantId IS NULL AND entity.id STARTS WITH $entityIdPrefix))
           AND NOT (entity)<-[:CONTAINS_ENTITY]-(:Document {tenantId:$tenantId})
         DETACH DELETE entity`,
        { tenantId, entityIdPrefix: `e-${tenantId}-` },
      );
    } catch (error: any) {
      this.logger.warn(`清理文档图谱数据失败: ${error.message}`);
    }
  }
}
