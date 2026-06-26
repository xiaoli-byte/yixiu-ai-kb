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
import { LlmService, ChatMessage } from "../llm/llm.service";
import { Neo4jService } from "../../database/neo4j/neo4j.service";
import { DocumentJobPayload, DOCUMENT_QUEUE } from "./queue.service";
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
  ) {}

  onModuleInit() {
    this.worker = new Worker<DocumentJobPayload>(
      DOCUMENT_QUEUE,
      async (job) => this.process(job),
      {
        connection: this.redis,
        concurrency: 2,
        lockDuration: 5 * 60 * 1000, // 5分钟锁，防止处理时间过长导致锁过期
      },
    );
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
      const fileType = this.getFileType(doc.mime, doc.title);
      let chunks: { text: string; tokens: number; page?: number }[];
      let fullText: string;

      if (fileType === "pdf") {
        const pages = await this.parsePdfPages(raw);
        if (pages.every((p) => !p.text.trim())) {
          throw new Error("PDF 内容为空（可能为扫描件或图片型 PDF，无可提取文本）");
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
          `INSERT INTO chunks (id, document_id, idx, text, tokens, page, embedding)
           VALUES ($1,$2,$3,$4,$5,$6,$7::vector)`,
          [id, documentId, i, chunks[i].text, chunks[i].tokens, page, vec],
        );
      }

      // Neo4j: 文档 / chunk 节点
      await this.neo4j.run(
        `MERGE (d:Document {id:$id}) SET d.tenantId=$tenantId, d.title=$title
         WITH d
         UNWIND $chunks AS c
         MERGE (ch:Chunk {id:c.id}) SET ch.documentId=$id, ch.idx=c.idx, ch.text=c.text
         MERGE (d)-[:HAS_CHUNK]->(ch)`,
        {
          id: documentId,
          tenantId,
          title: doc.title,
          chunks: chunks.map((c, i) => ({ id: chunkIds[i], idx: i, text: c.text.slice(0, 200) })),
        },
      );

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

  /**
   * 获取文件类型
   */
  private getFileType(mime: string, title: string): "pdf" | "office" | "text" {
    const ext = title.toLowerCase().slice(title.lastIndexOf(".") + 1);
    
    // PDF
    if (mime === "application/pdf" || ext === "pdf") {
      return "pdf";
    }
    
    // Office 文档
    const officeExts = ["docx", "doc", "xlsx", "xls", "pptx", "ppt", "xlsm", "docm", "pptm"];
    const officeMimes = [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint",
    ];
    
    if (officeExts.includes(ext) || officeMimes.includes(mime)) {
      return "office";
    }
    
    return "text";
  }

  private async updateStatus(id: string, status: string) {
    await this.prisma.document.update({ where: { id }, data: { status } });
  }

  private async parseText(buffer: Buffer, mime: string, title: string): Promise<string> {
    if (mime.startsWith("text/") || title.match(/\.(md|txt|json|csv)$/i)) {
      return buffer.toString("utf-8");
    }
    return buffer.toString("utf-8");
  }

  /**
   * 按页解析 PDF 文本，返回每页内容及页码
   */
  private async parsePdfPages(buffer: Buffer): Promise<{ page: number; text: string }[]> {
    // legacy 构建专为 Node.js 环境设计，修复 toHex 等 Node 24+ 兼容性问题
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const PDFJS = await import(
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      require.resolve("pdfjs-dist/legacy/build/pdf.mjs")
    );

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
    const entities: Array<{ id: string; name: string; type: string }> = (data.entities || []).map(
      (e: any) => ({ id: `e-${tenantId}-${e.name}`, name: e.name, type: e.type || "Concept" }),
    );
    const relations: Array<{ from: string; to: string; type: string }> = data.relations || [];

    if (entities.length === 0) return;

    await this.neo4j.run(
      `MATCH (d:Document {id:$docId})
       UNWIND $entities AS e
       MERGE (ent:Entity {id:e.id}) SET ent.name=e.name, ent.type=e.type
       MERGE (d)-[:CONTAINS_ENTITY]->(ent)
       WITH d, ent
       MATCH (c:Chunk {documentId:$docId})
       MERGE (ent)-[:MENTIONED_IN]->(c)`,
      { docId: documentId, entities },
    );

    for (const r of relations) {
      const fromId = `e-${tenantId}-${r.from}`;
      const toId = `e-${tenantId}-${r.to}`;
      await this.neo4j.run(
        `MATCH (a:Entity {id:$fromId}), (b:Entity {id:$toId})
         MERGE (a)-[rel:RELATES_TO {type:$type}]->(b)`,
        { fromId, toId, type: r.type || "RELATED" },
      );
    }
  }
}