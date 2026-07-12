// pdfjs-dist v6 Worker 依赖 Bluebird 的 Promise.try (Node.js v22 原生不支持)
// 必须在任何 pdfjs-dist import 之前打上 polyfill
if (typeof (Promise as any).try === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  void require("bluebird").config({ warnings: false });
  (Promise as any).try = function <T>(fn: () => T | Promise<T>): Promise<T> {
    return new Promise<T>((resolve) => resolve(fn()));
  };
}

// pdfjs-dist v6 需要 DOMMatrix（浏览器 API），Node.js 环境用 @napi-rs/canvas polyfill
// eslint-disable-next-line @typescript-eslint/no-require-imports
if (typeof (globalThis as any).DOMMatrix === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DOMMatrix: DM } = require("@napi-rs/canvas");
  Object.defineProperty(globalThis, "DOMMatrix", { value: DM, writable: true, configurable: true });
}
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { DatabaseService } from "../../database/database.service";
import { PRISMA } from "../../database/database.service";
import { PrismaClient } from "@prisma/client";
import { StorageService } from "../storage/storage.service";
import { EmbeddingsService } from "../embeddings/embeddings.service";
import { TextChunkerService } from "../embeddings/text-chunker.service";
import { OfficeParserService } from "../documents/office-parser.service";
import { FunAsrService } from "../documents/funasr.service";
import { OcrService } from "../documents/ocr.service";
import { getDocumentFileKind } from "../documents/document-file-types";
import { LlmService, ChatMessage } from "../llm/llm.service";
import { Neo4jService } from "../../database/neo4j/neo4j.service";
import { DocumentJobPayload, DOCUMENT_QUEUE } from "./queue.service";
import { AppConfigService } from "../../config/app-config.service";
import { v4 as uuid } from "uuid";
import {
  canonicalKey,
  chunkHash,
  contentHash,
  edgeKey,
  evidenceHash,
  knowledgeNodeId,
  normalizeContentText,
  relationKeyPart,
  sha256Hex,
} from "../../common/dedup/canonical";

@Injectable()
export class DocumentProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentProcessor.name);
  private worker!: Worker;

  constructor(
    @Inject("REDIS") private readonly redis: IORedis,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly embeddings: EmbeddingsService,
    private readonly llm: LlmService,
    private readonly neo4j: Neo4jService,
    private readonly db: DatabaseService,
    private readonly config: AppConfigService,
    private readonly chunker: TextChunkerService,
    private readonly officeParser: OfficeParserService,
    private readonly funAsr: FunAsrService,
    private readonly ocr: OcrService,
  ) {}

  onModuleInit() {
    const workerConfig = this.config.documentWorker;
    if (!workerConfig.enabled) {
      this.logger.log("文档处理 Worker 已禁用（DOCUMENT_WORKER_ENABLED=false）");
      return;
    }

    this.worker = new Worker<DocumentJobPayload>(
      DOCUMENT_QUEUE,
      async (job) => this.process(job),
      {
        connection: this.redis,
        concurrency: workerConfig.concurrency,
        lockDuration: 5 * 60 * 1000, // 5分钟锁，防止处理时间过长导致锁过期
      },
    );
    this.logger.log(`文档处理 Worker 已启动，并发数: ${workerConfig.concurrency}`);
    this.worker.on("failed", (job, err) =>
      this.logger.error(`任务 ${job?.id} 失败: ${err.message}`),
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<DocumentJobPayload>) {
    const { documentId, tenantId } = job.data;
    this.logger.log(`开始处理文档 ${documentId}`);
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) {
      this.logger.warn(`文档 ${documentId} 不存在`);
      return;
    }

    let processingContentId: string | null = null;
    try {
      await this.updateStatus(documentId, "PARSING");
      const raw = await this.storage.getObject(doc.storageKey);
      
      // 根据文件类型选择解析方式
      const fileType = getDocumentFileKind(doc.mime, doc.title);
      let pages: { page: number; text: string }[] | null = null;
      let fullText: string;

      if (!fileType) {
        throw new Error(`不支持的文件格式: ${doc.title}`);
      }

      if (fileType === "pdf") {
        pages = await this.parsePdfPages(raw);
        if (pages.every((p) => !p.text.trim())) {
          this.logger.log(`PDF ${documentId} 未提取到文本，尝试按扫描件 OCR`);
          pages = await this.ocrPdfPages(raw, doc.title);
          if (pages.every((p) => !p.text.trim())) {
            throw new Error("PDF OCR 内容为空");
          }
        }
        fullText = pages.map((p) => p.text).join("\n");
      } else if (fileType === "office") {
        // Office 文档（Word/Excel/PPT）
        fullText = await this.officeParser.parse(raw, doc.mime, doc.title);
      } else if (fileType === "audio") {
        fullText = await this.funAsr.transcribe(raw, doc.mime, doc.title);
      } else if (fileType === "image") {
        fullText = await this.ocr.recognizeImage(raw, doc.mime, doc.title);
      } else {
        // 纯文本文件
        fullText = await this.parseText(raw, doc.mime, doc.title);
      }

      fullText = normalizeContentText(fullText);
      if (!fullText.trim()) {
        throw new Error(fileType === "audio" ? "音频转写内容为空" : fileType === "image" ? "图片 OCR 内容为空" : "文档内容为空");
      }

      const parsedContentHash = contentHash(fullText);
      const parsedFileHash = (doc as any).fileHash || sha256Hex(raw);
      const reservedContent = await this.reserveContent({
        tenantId,
        documentId,
        title: doc.title,
        mime: doc.mime,
        size: Number(doc.size),
        storageKey: doc.storageKey,
        fileHash: parsedFileHash,
        contentHash: parsedContentHash,
        createdAt: doc.createdAt,
      });
      processingContentId = reservedContent.id;

      if (!reservedContent.shouldProcess) {
        await this.attachDuplicateUpload({
          tenantId,
          documentId,
          contentId: reservedContent.id,
          contentHash: parsedContentHash,
          fileHash: parsedFileHash,
          canonicalDocumentId: reservedContent.canonicalDocumentId,
          status: reservedContent.status,
          reason: reservedContent.status === "READY" ? "CONTENT_HASH" : "CONTENT_IN_PROGRESS",
        });
        this.logger.log(`文档 ${documentId} 内容已存在，关联 content ${reservedContent.id}，跳过 chunk/embedding/graph`);
        return;
      }

      await this.updateStatus(documentId, "CHUNKING", reservedContent.id);
      const chunks = pages
        ? await this.chunker.chunkPages(pages, 500, 50)
        : await this.chunker.chunk(fullText, 500, 50);
      if (chunks.length === 0) throw new Error("文档切分结果为空");
      
      this.logger.log(`文档 ${documentId} / content ${reservedContent.id} -> ${chunks.length} chunks`);

      // 清空旧 chunks
      await this.db.query(`DELETE FROM chunks WHERE content_id = $1`, [reservedContent.id]);

      await this.updateStatus(documentId, "EMBEDDING", reservedContent.id);
      const texts = chunks.map((c) => c.text);
      const vectors = await this.embeddings.embedBatch(texts);

      // 写 chunk（包含 page 列）
      const chunkIds: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const id = uuid();
        const vec = `[${vectors[i].join(",")}]`;
        const page = chunks[i].page ?? null;
        const inserted = await this.db.queryOne<{ id: string }>(
          `INSERT INTO chunks (
             id, document_id, content_id, chunk_hash, idx, text, tokens, page,
             embedding, tsv_zh, tsv_simple
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::vector,to_tsvector('zhcfg',$6),to_tsvector('simple',lower($6)))
           RETURNING id`,
          [id, documentId, reservedContent.id, chunkHash(chunks[i].text), i, chunks[i].text, chunks[i].tokens, page, vec],
        );
        chunkIds.push(inserted?.id || id);
      }

      // Neo4j: 文档 / chunk 节点
      await this.writeContentGraph({
        contentId: reservedContent.id,
        documentId,
        tenantId,
        title: doc.title,
        mime: doc.mime,
        contentHash: parsedContentHash,
        createdAt: doc.createdAt.toISOString(),
        chunks: chunks.map((c, i) => ({ id: chunkIds[i], idx: i, text: c.text.slice(0, 200) })),
      });

      // 实体抽取（可容错：失败不影响主流程）
      try {
        await this.extractAndLinkEntities(
          reservedContent.id,
          documentId,
          tenantId,
          fullText,
          chunks.map((c, i) => ({ id: chunkIds[i], text: c.text, page: c.page ?? null })),
        );
      } catch (e: any) {
        this.logger.warn(`实体抽取失败: ${e.message}`);
      }

      await this.markContentReady(reservedContent.id, documentId, chunks.length);
      await this.updateStatus(documentId, "READY", reservedContent.id);
      this.logger.log(`文档 ${documentId} / content ${reservedContent.id} 处理完成`);
    } catch (e: any) {
      this.logger.error(`文档 ${documentId} 失败: ${e.message}`, e.stack);
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: "FAILED", errorMessage: e.message?.slice(0, 500) },
      });
      if (processingContentId) {
        await this.db.query(
          `UPDATE document_contents
           SET status='FAILED', error_message=$2, updated_at=NOW()
           WHERE id=$1`,
          [processingContentId, e.message?.slice(0, 500)],
        );
        await this.db.query(
          `UPDATE documents
           SET status='FAILED',
               error_message=$2,
               updated_at=NOW()
           WHERE content_id=$1 AND status <> 'READY'`,
          [processingContentId, e.message?.slice(0, 500)],
        );
      }
      throw e;
    }
  }

  private async updateStatus(id: string, status: string, contentId?: string | null) {
    await this.prisma.document.update({ where: { id }, data: { status } });
    if (contentId) {
      await this.db.query(
        `UPDATE document_contents SET status=$2, updated_at=NOW() WHERE id=$1`,
        [contentId, status],
      );
      await this.db.query(
        `UPDATE documents
         SET status=$2,
             error_message=NULL,
             updated_at=NOW()
         WHERE content_id=$1
           AND status NOT IN ('READY', 'FAILED')`,
        [contentId, status],
      );
    }
  }

  private async reserveContent(opts: {
    tenantId: string;
    documentId: string;
    title: string;
    mime: string;
    size: number;
    storageKey: string;
    fileHash: string;
    contentHash: string;
    createdAt: Date;
  }): Promise<{
    id: string;
    status: string;
    canonicalDocumentId: string | null;
    shouldProcess: boolean;
  }> {
    const id = uuid();
    const inserted = await this.db.queryOne<{
      id: string;
      status: string;
      canonical_document_id: string | null;
    }>(
      `INSERT INTO document_contents (
         id, tenant_id, content_hash, first_file_hash, title, mime, size, status,
         storage_key, canonical_document_id, chunk_count, duplicate_count, source_count,
         created_at, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,'PARSING',$8,$9,0,1,1,$10,NOW())
       ON CONFLICT (tenant_id, content_hash) DO NOTHING
       RETURNING id, status, canonical_document_id`,
      [
        id,
        opts.tenantId,
        opts.contentHash,
        opts.fileHash,
        opts.title,
        opts.mime,
        opts.size,
        opts.storageKey,
        opts.documentId,
        opts.createdAt,
      ],
    );

    if (inserted) {
      await this.attachCanonicalUpload({
        tenantId: opts.tenantId,
        documentId: opts.documentId,
        contentId: inserted.id,
        contentHash: opts.contentHash,
        fileHash: opts.fileHash,
      });
      return {
        id: inserted.id,
        status: inserted.status,
        canonicalDocumentId: inserted.canonical_document_id,
        shouldProcess: true,
      };
    }

    const existing = await this.db.queryOne<{
      id: string;
      status: string;
      canonical_document_id: string | null;
      chunk_count: number | string;
    }>(
      `SELECT id, status, canonical_document_id, chunk_count
       FROM document_contents
       WHERE tenant_id=$1 AND content_hash=$2
       LIMIT 1`,
      [opts.tenantId, opts.contentHash],
    );
    if (!existing) throw new Error("内容去重记录创建失败");

    const chunkCount = Number(existing.chunk_count || 0);
    if (existing.status === "READY" && chunkCount > 0) {
      return {
        id: existing.id,
        status: existing.status,
        canonicalDocumentId: existing.canonical_document_id,
        shouldProcess: false,
      };
    }

    if (
      existing.status !== "FAILED" &&
      existing.canonical_document_id &&
      existing.canonical_document_id !== opts.documentId
    ) {
      return {
        id: existing.id,
        status: existing.status,
        canonicalDocumentId: existing.canonical_document_id,
        shouldProcess: false,
      };
    }

    await this.db.query(
      `UPDATE document_contents
       SET status='PARSING',
           canonical_document_id=$2,
           title=$3,
           mime=$4,
           size=$5,
           storage_key=$6,
           first_file_hash=COALESCE(first_file_hash, $7),
           error_message=NULL,
           updated_at=NOW()
       WHERE id=$1`,
      [
        existing.id,
        opts.documentId,
        opts.title,
        opts.mime,
        opts.size,
        opts.storageKey,
        opts.fileHash,
      ],
    );
    await this.attachCanonicalUpload({
      tenantId: opts.tenantId,
      documentId: opts.documentId,
      contentId: existing.id,
      contentHash: opts.contentHash,
      fileHash: opts.fileHash,
    });
    return {
      id: existing.id,
      status: "PARSING",
      canonicalDocumentId: opts.documentId,
      shouldProcess: true,
    };
  }

  private async attachCanonicalUpload(opts: {
    tenantId: string;
    documentId: string;
    contentId: string;
    contentHash: string;
    fileHash: string;
  }) {
    await this.db.query(
      `UPDATE documents
       SET content_id=$3,
           content_hash=$4,
           file_hash=COALESCE(file_hash, $5),
           duplicate_of_document_id=NULL,
           dedup_reason=NULL,
           updated_at=NOW()
       WHERE tenant_id=$1 AND id=$2`,
      [opts.tenantId, opts.documentId, opts.contentId, opts.contentHash, opts.fileHash],
    );
  }

  private async attachDuplicateUpload(opts: {
    tenantId: string;
    documentId: string;
    contentId: string;
    contentHash: string;
    fileHash: string;
    canonicalDocumentId: string | null;
    status: string;
    reason: string;
  }) {
    const status = this.statusFromContentStatus(opts.status);
    await this.db.query(
      `UPDATE documents
       SET content_id=$3,
           content_hash=$4,
           file_hash=COALESCE(file_hash, $5),
           duplicate_of_document_id=$6,
           dedup_reason=$7,
           status=$8,
           updated_at=NOW()
       WHERE tenant_id=$1 AND id=$2`,
      [
        opts.tenantId,
        opts.documentId,
        opts.contentId,
        opts.contentHash,
        opts.fileHash,
        opts.canonicalDocumentId,
        opts.reason,
        status,
      ],
    );
    await this.refreshContentStats(opts.contentId);
  }

  private statusFromContentStatus(status: string | null | undefined) {
    if (status === "READY") return "READY";
    if (status === "PARSING" || status === "CHUNKING" || status === "EMBEDDING") return status;
    if (status === "FAILED") return "FAILED";
    return "PENDING";
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

  private async markContentReady(contentId: string, documentId: string, chunkCount: number) {
    await this.db.query(
      `UPDATE document_contents
       SET status='READY',
           canonical_document_id=$2,
           chunk_count=$3,
           error_message=NULL,
           updated_at=NOW()
       WHERE id=$1`,
      [contentId, documentId, chunkCount],
    );
    await this.db.query(
      `UPDATE documents
       SET status='READY',
           error_message=NULL,
           updated_at=NOW()
       WHERE content_id=$1`,
      [contentId],
    );
    await this.refreshContentStats(contentId);
  }

  private async writeContentGraph(opts: {
    contentId: string;
    documentId: string;
    tenantId: string;
    title: string;
    mime: string;
    contentHash: string;
    createdAt: string;
    chunks: Array<{ id: string; idx: number; text: string }>;
  }) {
    const graphUpdatedAt = new Date().toISOString();
    await this.neo4j.run(
      `MATCH (:Document {id:$id})-[:HAS_CHUNK]->(oldChunk:Chunk)
       DETACH DELETE oldChunk`,
      { id: opts.contentId },
    );
    await this.neo4j.run(
      `MERGE (d:Document {id:$id})
       ON CREATE SET d.createdAt=$createdAt
       SET d.tenantId=$tenantId,
           d.title=$title,
           d.mime=$mime,
           d.contentId=$id,
           d.canonicalDocumentId=$documentId,
           d.contentHash=$contentHash,
           d.updatedAt=$updatedAt,
           d.chunkCount=$chunkCount
       WITH d
       UNWIND $chunks AS c
       MERGE (ch:Chunk {id:c.id})
       ON CREATE SET ch.createdAt=$updatedAt
       SET ch.tenantId=$tenantId,
           ch.documentId=$documentId,
           ch.contentId=$id,
           ch.idx=c.idx,
           ch.text=c.text,
           ch.updatedAt=$updatedAt
       MERGE (d)-[:HAS_CHUNK]->(ch)`,
      {
        id: opts.contentId,
        documentId: opts.documentId,
        tenantId: opts.tenantId,
        title: opts.title,
        mime: opts.mime,
        contentHash: opts.contentHash,
        createdAt: opts.createdAt,
        updatedAt: graphUpdatedAt,
        chunkCount: opts.chunks.length,
        chunks: opts.chunks,
      },
    );
  }

  private async parseText(buffer: Buffer, mime: string, title: string): Promise<string> {
    return this.decodeText(buffer);
  }

  private decodeText(buffer: Buffer): string {
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      return buffer.subarray(3).toString("utf8");
    }
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
      return buffer.subarray(2).toString("utf16le");
    }
    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
      return this.decodeUtf16Be(buffer.subarray(2));
    }

    const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
    let evenNulls = 0;
    let oddNulls = 0;
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) {
        if (i % 2 === 0) evenNulls += 1;
        else oddNulls += 1;
      }
    }
    if (oddNulls > evenNulls * 2 && oddNulls > 8) {
      return buffer.toString("utf16le");
    }
    if (evenNulls > oddNulls * 2 && evenNulls > 8) {
      return this.decodeUtf16Be(buffer);
    }

    return buffer.toString("utf8");
  }

  private decodeUtf16Be(buffer: Buffer): string {
    const swapped = Buffer.allocUnsafe(buffer.length);
    for (let i = 0; i < buffer.length; i += 2) {
      swapped[i] = buffer[i + 1] ?? 0;
      swapped[i + 1] = buffer[i];
    }
    return swapped.toString("utf16le");
  }

  /**
   * 按页解析 PDF 文本，返回每页内容及页码
   */
  private async parsePdfPages(buffer: Buffer): Promise<{ page: number; text: string }[]> {
    const PDFJS = await this.loadPdfJs();
    const data = await PDFJS.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages: { page: number; text: string }[] = [];

    for (let i = 1; i <= data.numPages; i++) {
      // eslint-disable-next-line no-loop-func
      const pageObj = await data.getPage(i);
      const content = await pageObj.getTextContent();
      const text = content.items
        .map((item: any) => item.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      pages.push({ page: i, text });
    }

    return pages;
  }

  private async ocrPdfPages(buffer: Buffer, filename: string): Promise<{ page: number; text: string }[]> {
    const PDFJS = await this.loadPdfJs();
    const { createCanvas } = await import("@napi-rs/canvas");
    const data = await PDFJS.getDocument({ data: new Uint8Array(buffer) }).promise;
    const configuredMaxPages = this.config.ocr.pdfMaxPages;
    const maxPages =
      Number.isFinite(configuredMaxPages) && configuredMaxPages > 0
        ? Math.min(data.numPages, configuredMaxPages)
        : data.numPages;
    const configuredScale = this.config.ocr.pdfRenderScale;
    const scale =
      Number.isFinite(configuredScale) && configuredScale > 0
        ? Math.min(Math.max(configuredScale, 0.5), 4)
        : 2;
    const pages: { page: number; text: string }[] = [];

    if (maxPages < data.numPages) {
      this.logger.warn(`扫描 PDF 页数 ${data.numPages}，仅 OCR 前 ${maxPages} 页（OCR_PDF_MAX_PAGES）`);
    }

    try {
      for (let i = 1; i <= maxPages; i++) {
        const pageObj = await data.getPage(i);
        const viewport = pageObj.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext("2d");

        await pageObj.render({ canvasContext: context as any, viewport } as any).promise;
        const image = await canvas.encode("png");
        const text = await this.ocr.recognizeImage(image, "image/png", `${filename}-page-${i}.png`);
        pages.push({ page: i, text });
        pageObj.cleanup?.();
      }
    } finally {
      await data.destroy?.();
    }

    return pages;
  }

  private async loadPdfJs(): Promise<any> {
    // legacy 构建专为 Node.js 环境设计，修复 toHex 等 Node 24+ 兼容性问题
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return import(
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      require.resolve("pdfjs-dist/legacy/build/pdf.mjs")
    );
  }

  private async extractAndLinkEntities(
    contentId: string,
    documentId: string,
    tenantId: string,
    text: string,
    chunks: Array<{ id: string; text: string; page?: number | null }>,
  ) {
    const sample = text.slice(0, 4000);
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "你是一个实体与关系抽取助手。请从给定文本中提取关键实体和它们之间的关系，输出严格的 JSON。",
      },
      {
        role: "user",
        content: `请从以下文本提取，输出 JSON 格式：{"entities":[{"name":"...","type":"Person|Org|Tech|Concept|Location"}],"relations":[{"from":"...","to":"...","type":"..."}]}。最多 30 个实体。\n\n文本：\n${sample}`,
      },
    ];
    const raw = await this.llm.chat(messages, { temperature: 0.1, maxTokens: 1500 });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    const data = JSON.parse(jsonMatch[0]);
    const entityMap = new Map<string, { id: string; name: string; type: string; canonicalKey: string }>();
    const nameToCanonicalKey = new Map<string, string>();
    for (const item of data.entities || []) {
      const name = String(item?.name || "").trim();
      if (!name) continue;
      const type = String(item?.type || "Concept").trim() || "Concept";
      const key = canonicalKey(type, name);
      if (!key.split(":")[1]) continue;
      entityMap.set(key, {
        id: knowledgeNodeId(tenantId, key),
        name,
        type,
        canonicalKey: key,
      });
      nameToCanonicalKey.set(name, key);
    }
    const entities = Array.from(entityMap.values()).slice(0, 30);
    const relationMap = new Map<string, { fromKey: string; toKey: string; type: string; fromName: string; toName: string }>();
    for (const item of data.relations || []) {
      const fromName = String(item?.from || "").trim();
      const toName = String(item?.to || "").trim();
      const type = String(item?.type || "RELATED").trim() || "RELATED";
      const fromKey = nameToCanonicalKey.get(fromName);
      const toKey = nameToCanonicalKey.get(toName);
      if (!fromKey || !toKey || fromKey === toKey) continue;
      relationMap.set(edgeKey(fromKey, type, toKey), { fromKey, toKey, type, fromName, toName });
    }
    const relations = Array.from(relationMap.values());

    if (entities.length === 0) return;

    for (const entity of entities) {
      await this.upsertKnowledgeNode(tenantId, entity);
    }

    const now = new Date().toISOString();
    await this.neo4j.run(
      `MATCH (d:Document {id:$contentId, tenantId:$tenantId})
       UNWIND $entities AS e
       MERGE (ent:Entity {id:e.id})
       ON CREATE SET ent.createdAt=$now
       SET ent.name=e.name,
           ent.type=e.type,
           ent.canonicalKey=e.canonicalKey,
           ent.tenantId=$tenantId,
           ent.updatedAt=$now
       MERGE (d)-[:CONTAINS_ENTITY]->(ent)
       WITH d, ent
       MATCH (c:Chunk {contentId:$contentId})
       MERGE (ent)-[:MENTIONED_IN {contentId:$contentId}]->(c)
       WITH DISTINCT ent
       OPTIONAL MATCH (ent)<-[:CONTAINS_ENTITY]-(doc:Document {tenantId:$tenantId})
       WITH ent, count(DISTINCT doc) AS documentCount
       OPTIONAL MATCH (ent)-[:MENTIONED_IN]->(chunk:Chunk)
       WITH ent, documentCount, count(DISTINCT chunk) AS mentionCount
       SET ent.documentCount=documentCount, ent.mentionCount=mentionCount`,
      { contentId, tenantId, entities, now },
    );

    for (const r of relations) {
      const from = entityMap.get(r.fromKey);
      const to = entityMap.get(r.toKey);
      if (!from || !to) continue;
      const evidenceChunk =
        chunks.find((chunk) => chunk.text.includes(r.fromName) && chunk.text.includes(r.toName)) ||
        chunks.find((chunk) => chunk.text.includes(r.fromName) || chunk.text.includes(r.toName)) ||
        chunks[0];
      const edgeStats = await this.upsertKnowledgeEdge({
        tenantId,
        contentId,
        documentId,
        source: from,
        target: to,
        relationType: r.type || "RELATED",
        chunkId: evidenceChunk?.id ?? null,
        evidenceText: evidenceChunk?.text ? evidenceChunk.text.slice(0, 240) : null,
      });
      await this.neo4j.run(
        `MATCH (a:Entity {id:$fromId}), (b:Entity {id:$toId})
         MERGE (a)-[rel:RELATES_TO {edgeKey:$edgeKey}]->(b)
         ON CREATE SET rel.createdAt=$now
         SET rel.tenantId=$tenantId,
             rel.type=$type,
             rel.edgeId=$edgeId,
             rel.updatedAt=$now,
             rel.weight=$weight,
             rel.evidenceCount=$evidenceCount,
             rel.sourceCount=$sourceCount`,
        {
          fromId: from.id,
          toId: to.id,
          edgeId: edgeStats.id,
          edgeKey: edgeStats.edgeKey,
          type: r.type || "RELATED",
          tenantId,
          now,
          weight: edgeStats.weight,
          evidenceCount: edgeStats.evidenceCount,
          sourceCount: edgeStats.sourceCount,
        },
      );
    }
  }

  private async upsertKnowledgeNode(
    tenantId: string,
    entity: { id: string; name: string; type: string; canonicalKey: string },
  ) {
    await this.db.query(
      `INSERT INTO knowledge_nodes (
         id, tenant_id, canonical_key, name, type, aliases, source_count, mention_count
       )
       VALUES ($1,$2,$3,$4,$5,to_jsonb(ARRAY[$4]::text[]),0,0)
       ON CONFLICT (tenant_id, canonical_key)
       DO UPDATE SET
         type = EXCLUDED.type,
         aliases = CASE
           WHEN knowledge_nodes.aliases ? $4 THEN knowledge_nodes.aliases
           ELSE knowledge_nodes.aliases || to_jsonb($4::text)
         END,
         updated_at = NOW()`,
      [entity.id, tenantId, entity.canonicalKey, entity.name, entity.type],
    );
  }

  private async upsertKnowledgeEdge(opts: {
    tenantId: string;
    contentId: string;
    documentId: string;
    source: { id: string; canonicalKey: string };
    target: { id: string; canonicalKey: string };
    relationType: string;
    chunkId?: string | null;
    evidenceText?: string | null;
  }): Promise<{
    id: string;
    edgeKey: string;
    weight: number;
    evidenceCount: number;
    sourceCount: number;
  }> {
    const key = edgeKey(opts.source.canonicalKey, opts.relationType, opts.target.canonicalKey);
    const id = `ke-${opts.tenantId}-${sha256Hex(key).slice(0, 32)}`;
    const row = await this.db.queryOne<{ id: string }>(
      `INSERT INTO knowledge_edges (
         id, tenant_id, source_node_id, target_node_id, relation_type, edge_key,
         weight, evidence_count, source_count
       )
       VALUES ($1,$2,$3,$4,$5,$6,1,0,0)
       ON CONFLICT (tenant_id, edge_key)
       DO UPDATE SET
         relation_type = EXCLUDED.relation_type,
         updated_at = NOW()
       RETURNING id`,
      [id, opts.tenantId, opts.source.id, opts.target.id, relationKeyPart(opts.relationType), key],
    );
    const edgeId = row?.id || id;
    const eHash = evidenceHash([edgeId, opts.contentId, opts.chunkId, opts.evidenceText]);
    await this.db.query(
      `INSERT INTO edge_evidences (
         id, tenant_id, edge_id, document_content_id, document_id,
         chunk_id, evidence_hash, evidence_text
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT DO NOTHING`,
      [
        uuid(),
        opts.tenantId,
        edgeId,
        opts.contentId,
        opts.documentId,
        opts.chunkId ?? null,
        eHash,
        opts.evidenceText ?? null,
      ],
    );

    const stats = await this.db.queryOne<{
      evidence_count: string | number;
      source_count: string | number;
    }>(
      `SELECT COUNT(*) AS evidence_count,
              COUNT(DISTINCT document_content_id) AS source_count
       FROM edge_evidences
       WHERE edge_id=$1`,
      [edgeId],
    );
    const evidenceCount = Number(stats?.evidence_count || 0);
    const sourceCount = Number(stats?.source_count || 0);
    await this.db.query(
      `UPDATE knowledge_edges
       SET evidence_count=$2,
           source_count=$3,
           weight=GREATEST($2, 1),
           updated_at=NOW()
       WHERE id=$1`,
      [edgeId, evidenceCount, sourceCount],
    );
    return {
      id: edgeId,
      edgeKey: key,
      evidenceCount,
      sourceCount,
      weight: Math.max(evidenceCount, 1),
    };
  }
}
