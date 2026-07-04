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
import { ConfigService } from "@nestjs/config";
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
import { RagFactExtractionService } from "../rag/rag-fact-extraction.service";
import { RagFactsService } from "../rag/rag-facts.service";
import { v4 as uuid } from "uuid";

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
    private readonly config: ConfigService,
    private readonly chunker: TextChunkerService,
    private readonly officeParser: OfficeParserService,
    private readonly funAsr: FunAsrService,
    private readonly ocr: OcrService,
    private readonly ragExtractor: RagFactExtractionService,
    private readonly ragFacts: RagFactsService,
  ) {}

  onModuleInit() {
    const enabled =
      (this.config.get<string>("DOCUMENT_WORKER_ENABLED") || "true").toLowerCase() !== "false";
    if (!enabled) {
      this.logger.log("文档处理 Worker 已禁用（DOCUMENT_WORKER_ENABLED=false）");
      return;
    }

    const concurrency = Math.max(
      1,
      Number(this.config.get<string>("DOCUMENT_WORKER_CONCURRENCY") || 1),
    );
    this.worker = new Worker<DocumentJobPayload>(
      DOCUMENT_QUEUE,
      async (job) => this.process(job),
      {
        connection: this.redis,
        concurrency,
        lockDuration: 5 * 60 * 1000, // 5分钟锁，防止处理时间过长导致锁过期
      },
    );
    this.logger.log(`文档处理 Worker 已启动，并发数: ${concurrency}`);
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

    try {
      await this.updateStatus(documentId, "PARSING");
      const raw = await this.storage.getObject(doc.storageKey);
      
      // 根据文件类型选择解析方式
      const fileType = getDocumentFileKind(doc.mime, doc.title);
      let chunks: { text: string; tokens: number; page?: number }[];
      let fullText: string;

      if (!fileType) {
        throw new Error(`不支持的文件格式: ${doc.title}`);
      }

      if (fileType === "pdf") {
        let pages = await this.parsePdfPages(raw);
        if (pages.every((p) => !p.text.trim())) {
          this.logger.log(`PDF ${documentId} 未提取到文本，尝试按扫描件 OCR`);
          pages = await this.ocrPdfPages(raw, doc.title);
          if (pages.every((p) => !p.text.trim())) {
            throw new Error("PDF OCR 内容为空");
          }
        }
        chunks = await this.chunker.chunkPages(pages, 500, 50);
        fullText = pages.map((p) => p.text).join("\n");
      } else if (fileType === "office") {
        // Office 文档（Word/Excel/PPT）
        fullText = await this.officeParser.parse(raw, doc.mime, doc.title);
        if (!fullText.trim()) {
          throw new Error("文档内容为空");
        }
        chunks = await this.chunker.chunk(fullText, 500, 50);
      } else if (fileType === "audio") {
        fullText = await this.funAsr.transcribe(raw, doc.mime, doc.title);
        if (!fullText.trim()) {
          throw new Error("音频转写内容为空");
        }
        chunks = await this.chunker.chunk(fullText, 500, 50);
      } else if (fileType === "image") {
        fullText = await this.ocr.recognizeImage(raw, doc.mime, doc.title);
        if (!fullText.trim()) {
          throw new Error("图片 OCR 内容为空");
        }
        chunks = await this.chunker.chunk(fullText, 500, 50);
      } else {
        // 纯文本文件
        fullText = await this.parseText(raw, doc.mime, doc.title);
        if (!fullText.trim()) {
          throw new Error("文档内容为空");
        }
        chunks = await this.chunker.chunk(fullText, 500, 50);
      }
      
      this.logger.log(`文档 ${documentId} -> ${chunks.length} chunks`);

      // 清空旧 chunks
      await this.prisma.chunk.deleteMany({ where: { documentId } });

      await this.updateStatus(documentId, "EMBEDDING");
      const texts = chunks.map((c) => c.text);
      const vectors = await this.embeddings.embedBatch(texts);

      // 写 chunk（包含 page 列）
      const chunkIds: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const id = uuid();
        chunkIds.push(id);
        const vec = `[${vectors[i].join(",")}]`;
        const page = chunks[i].page ?? null;
        await this.db.query(
          `INSERT INTO chunks (id, document_id, idx, text, tokens, page, embedding, tsv_zh, tsv_simple)
           VALUES ($1,$2,$3,$4,$5,$6,$7::vector,to_tsvector('zhcfg',$4),to_tsvector('simple',lower($4)))`,
          [id, documentId, i, chunks[i].text, chunks[i].tokens, page, vec],
        );
      }

      // Neo4j: 文档 / chunk 节点
      const graphUpdatedAt = new Date().toISOString();
      await this.neo4j.run(
        `MATCH (:Document {id:$id})-[:HAS_CHUNK]->(oldChunk:Chunk)
         DETACH DELETE oldChunk`,
        { id: documentId },
      );
      await this.neo4j.run(
        `MERGE (d:Document {id:$id})
         ON CREATE SET d.createdAt=$createdAt
         SET d.tenantId=$tenantId,
             d.title=$title,
             d.mime=$mime,
             d.updatedAt=$updatedAt,
             d.chunkCount=$chunkCount
         WITH d
         UNWIND $chunks AS c
         MERGE (ch:Chunk {id:c.id})
         ON CREATE SET ch.createdAt=$updatedAt
         SET ch.tenantId=$tenantId,
             ch.documentId=$id,
             ch.idx=c.idx,
             ch.text=c.text,
             ch.updatedAt=$updatedAt
         MERGE (d)-[:HAS_CHUNK]->(ch)`,
        {
          id: documentId,
          tenantId,
          title: doc.title,
          mime: doc.mime,
          createdAt: doc.createdAt.toISOString(),
          updatedAt: graphUpdatedAt,
          chunkCount: chunks.length,
          chunks: chunks.map((c, i) => ({ id: chunkIds[i], idx: i, text: c.text.slice(0, 200) })),
        },
      );

      // 结构化事实抽取：面向电商 / KTV / 外贸 / CRM，同时保留简历时间线回归能力
      try {
        await this.ragFacts.replaceDocumentFacts({ tenantId, documentId, facts: [] });
        const facts = await this.ragExtractor.extractDocumentFacts({
          tenantId,
          documentId,
          title: doc.title,
          mime: doc.mime,
          fullText,
          chunks: chunks.map((c, i) => ({
            id: chunkIds[i],
            text: c.text,
            page: c.page ?? null,
          })),
        });
        if (facts.length > 0) {
          await this.ragFacts.replaceDocumentFacts({ tenantId, documentId, facts });
        }
        this.logger.log(`文档 ${documentId} -> ${facts.length} structured facts`);
      } catch (e: any) {
        this.logger.warn(`结构化事实抽取失败: ${e.message}`);
      }

      // 实体抽取（可容错：失败不影响主流程）
      try {
        await this.extractAndLinkEntities(documentId, tenantId, fullText, chunkIds);
      } catch (e: any) {
        this.logger.warn(`实体抽取失败: ${e.message}`);
      }

      await this.updateStatus(documentId, "READY");
      this.logger.log(`文档 ${documentId} 处理完成`);
    } catch (e: any) {
      this.logger.error(`文档 ${documentId} 失败: ${e.message}`, e.stack);
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: "FAILED", errorMessage: e.message?.slice(0, 500) },
      });
      throw e;
    }
  }

  private async updateStatus(id: string, status: string) {
    await this.prisma.document.update({ where: { id }, data: { status } });
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
    const configuredMaxPages = Number(this.config.get<string>("OCR_PDF_MAX_PAGES") || 0);
    const maxPages =
      Number.isFinite(configuredMaxPages) && configuredMaxPages > 0
        ? Math.min(data.numPages, configuredMaxPages)
        : data.numPages;
    const configuredScale = Number(this.config.get<string>("OCR_PDF_RENDER_SCALE") || 2);
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
    documentId: string,
    tenantId: string,
    text: string,
    chunkIds: string[],
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
    const entityMap = new Map<string, { id: string; name: string; type: string }>();
    for (const item of data.entities || []) {
      const name = String(item?.name || "").trim();
      if (!name) continue;
      entityMap.set(name, {
        id: `e-${tenantId}-${name}`,
        name,
        type: String(item?.type || "Concept").trim() || "Concept",
      });
    }
    const entities = Array.from(entityMap.values()).slice(0, 30);
    const relations: Array<{ from: string; to: string; type: string }> = (data.relations || [])
      .map((item: any) => ({
        from: String(item?.from || "").trim(),
        to: String(item?.to || "").trim(),
        type: String(item?.type || "RELATED").trim() || "RELATED",
      }))
      .filter((item: { from: string; to: string; type: string }) =>
        Boolean(item.from && item.to && entityMap.has(item.from) && entityMap.has(item.to)),
      );

    if (entities.length === 0) return;

    const now = new Date().toISOString();
    await this.neo4j.run(
      `MATCH (d:Document {id:$docId, tenantId:$tenantId})
       UNWIND $entities AS e
       MERGE (ent:Entity {id:e.id})
       ON CREATE SET ent.createdAt=$now
       SET ent.name=e.name,
           ent.type=e.type,
           ent.tenantId=$tenantId,
           ent.updatedAt=$now
       MERGE (d)-[:CONTAINS_ENTITY]->(ent)
       WITH d, ent
       MATCH (c:Chunk {documentId:$docId})
       MERGE (ent)-[:MENTIONED_IN {documentId:$docId}]->(c)
       WITH DISTINCT ent
       OPTIONAL MATCH (ent)<-[:CONTAINS_ENTITY]-(doc:Document {tenantId:$tenantId})
       WITH ent, count(DISTINCT doc) AS documentCount
       OPTIONAL MATCH (ent)-[:MENTIONED_IN]->(chunk:Chunk)
       WITH ent, documentCount, count(DISTINCT chunk) AS mentionCount
       SET ent.documentCount=documentCount, ent.mentionCount=mentionCount`,
      { docId: documentId, tenantId, entities, now },
    );

    for (const r of relations) {
      const fromId = `e-${tenantId}-${r.from}`;
      const toId = `e-${tenantId}-${r.to}`;
      await this.neo4j.run(
        `MATCH (a:Entity {id:$fromId}), (b:Entity {id:$toId})
         MERGE (a)-[rel:RELATES_TO {type:$type}]->(b)
         ON CREATE SET rel.createdAt=$now, rel.weight=0
         SET rel.tenantId=$tenantId,
             rel.updatedAt=$now,
             rel.weight=coalesce(rel.weight, 0) + 1`,
        { fromId, toId, type: r.type || "RELATED", tenantId, now },
      );
    }
  }
}
