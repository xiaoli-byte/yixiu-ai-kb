import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { v4 as uuid } from "uuid";
import { DatabaseService } from "../../database/database.service";
import type {
  QaRunLogInput,
  RagDomain,
  StructuredFact,
  StructuredFactInput,
} from "./rag.types";

@Injectable()
export class RagFactsService implements OnModuleInit {
  private readonly logger = new Logger(RagFactsService.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    try {
      await this.ensureSchema();
    } catch (e: any) {
      this.logger.warn(`RAG 事实表初始化失败，后续将降级为纯检索问答: ${e.message}`);
    }
  }

  async replaceDocumentFacts(opts: {
    tenantId: string;
    documentId: string;
    facts: StructuredFactInput[];
  }) {
    await this.db.query(`DELETE FROM structured_facts WHERE document_id = $1`, [opts.documentId]);
    if (opts.facts.length === 0) return;

    for (const fact of opts.facts) {
      await this.insertFact(fact);
    }
  }

  async findFacts(opts: {
    tenantId: string;
    domain?: RagDomain;
    entityTypes?: string[];
    query?: string;
    documentIds?: string[];
    limit?: number;
  }): Promise<StructuredFact[]> {
    const params: any[] = [opts.tenantId];
    const where = [`sf.tenant_id = $1`];

    if (opts.domain && opts.domain !== "default") {
      params.push(opts.domain);
      where.push(`sf.domain = $${params.length}`);
    }

    if (opts.entityTypes?.length) {
      params.push(opts.entityTypes);
      where.push(`sf.entity_type = ANY($${params.length}::text[])`);
    }

    if (opts.documentIds?.length) {
      params.push(opts.documentIds);
      where.push(`sf.document_id = ANY($${params.length}::text[])`);
    }

    const keywords = this.extractKeywords(opts.query || "");
    if (keywords.length > 0 && opts.domain === "default" && !opts.documentIds?.length) {
      const keywordClauses: string[] = [];
      for (const keyword of keywords.slice(0, 4)) {
        params.push(`%${keyword}%`);
        keywordClauses.push(
          `(sf.entity_name ILIKE $${params.length} OR sf.source_text ILIKE $${params.length} OR sf.attributes::text ILIKE $${params.length})`,
        );
      }
      where.push(`(${keywordClauses.join(" OR ")})`);
    }

    params.push(Math.min(opts.limit || 12, 50));
    const rows = await this.db.query<any>(
      `SELECT sf.id,
              sf.tenant_id AS "tenantId",
              sf.document_id AS "documentId",
              sf.chunk_id AS "chunkId",
              sf.domain,
              sf.entity_type AS "entityType",
              sf.entity_name AS "entityName",
              sf.attributes,
              sf.confidence,
              sf.source_text AS "sourceText",
              sf.created_at AS "createdAt",
              d.title AS "documentTitle",
              d.mime AS mime,
              c.page AS page
       FROM structured_facts sf
       JOIN documents d ON d.id = sf.document_id
       LEFT JOIN chunks c ON c.id = sf.chunk_id
       WHERE ${where.join(" AND ")}
       ORDER BY sf.confidence DESC, sf.created_at DESC
       LIMIT $${params.length}`,
      params,
    );

    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      documentId: r.documentId,
      chunkId: r.chunkId,
      domain: r.domain,
      entityType: r.entityType,
      entityName: r.entityName,
      attributes: r.attributes || {},
      confidence: Number(r.confidence) || 0,
      sourceText: r.sourceText,
      documentTitle: r.documentTitle,
      mime: r.mime,
      page: r.page ?? null,
      createdAt: r.createdAt,
    }));
  }

  async logQaRun(input: QaRunLogInput) {
    try {
      await this.db.query(
        `INSERT INTO qa_run_logs (
           id, tenant_id, user_id, conversation_id, question, rewritten_query,
           intent, domain, facts, chunks, tool_result, answer, error
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13)`,
        [
          uuid(),
          input.tenantId,
          input.userId ?? null,
          input.conversationId ?? null,
          input.question,
          input.rewrittenQuery ?? null,
          input.intent,
          input.domain,
          JSON.stringify((input.facts || []).map((fact) => this.factForLog(fact))),
          JSON.stringify(
            (input.chunks || []).map((chunk) => ({
              chunkId: chunk.chunkId,
              documentId: chunk.documentId,
              documentTitle: chunk.documentTitle,
              score: chunk.score,
              sources: chunk.sources,
            })),
          ),
          JSON.stringify(input.toolResult || null),
          input.answer ?? null,
          input.error ?? null,
        ],
      );
    } catch (e: any) {
      this.logger.warn(`QA 运行日志写入失败: ${e.message}`);
    }
  }

  private async insertFact(fact: StructuredFactInput) {
    await this.db.query(
      `INSERT INTO structured_facts (
         id, tenant_id, document_id, chunk_id, domain, entity_type, entity_name,
         attributes, confidence, source_text
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
      [
        uuid(),
        fact.tenantId,
        fact.documentId,
        fact.chunkId ?? null,
        fact.domain,
        fact.entityType,
        fact.entityName,
        JSON.stringify(fact.attributes || {}),
        Math.max(0, Math.min(1, fact.confidence)),
        fact.sourceText,
      ],
    );
  }

  private async ensureSchema() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS structured_facts (
        id            VARCHAR(36)  NOT NULL,
        tenant_id     VARCHAR(36)  NOT NULL,
        document_id   VARCHAR(36)  NOT NULL,
        chunk_id      VARCHAR(36),
        domain        VARCHAR(50)  NOT NULL,
        entity_type   VARCHAR(80)  NOT NULL,
        entity_name   VARCHAR(500) NOT NULL,
        attributes    JSONB        NOT NULL DEFAULT '{}'::jsonb,
        confidence    DOUBLE PRECISION NOT NULL DEFAULT 0.5,
        source_text   TEXT         NOT NULL,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id),
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE SET NULL
      )
    `);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS qa_run_logs (
        id              VARCHAR(36) NOT NULL,
        tenant_id       VARCHAR(36) NOT NULL,
        user_id         VARCHAR(36),
        conversation_id VARCHAR(36),
        question        TEXT        NOT NULL,
        rewritten_query TEXT,
        intent          VARCHAR(50) NOT NULL,
        domain          VARCHAR(50) NOT NULL,
        facts           JSONB       NOT NULL DEFAULT '[]'::jsonb,
        chunks          JSONB       NOT NULL DEFAULT '[]'::jsonb,
        tool_result     JSONB,
        answer          TEXT,
        error           TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id)
      )
    `);
    await this.db.query(
      `CREATE INDEX IF NOT EXISTS structured_facts_tenant_domain_idx
       ON structured_facts (tenant_id, domain, entity_type)`,
    );
    await this.db.query(
      `CREATE INDEX IF NOT EXISTS structured_facts_document_idx
       ON structured_facts (document_id)`,
    );
    await this.db.query(
      `CREATE INDEX IF NOT EXISTS structured_facts_attributes_idx
       ON structured_facts USING gin (attributes)`,
    );
    await this.db.query(
      `CREATE INDEX IF NOT EXISTS structured_facts_source_trgm_idx
       ON structured_facts USING gin (source_text gin_trgm_ops)`,
    );
    await this.db.query(
      `CREATE INDEX IF NOT EXISTS qa_run_logs_tenant_created_idx
       ON qa_run_logs (tenant_id, created_at DESC)`,
    );
  }

  private factForLog(fact: StructuredFact) {
    return {
      id: fact.id,
      documentId: fact.documentId,
      chunkId: fact.chunkId,
      domain: fact.domain,
      entityType: fact.entityType,
      entityName: fact.entityName,
      attributes: fact.attributes,
      confidence: fact.confidence,
    };
  }

  private extractKeywords(query: string) {
    return query
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]+/g, " ")
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2 && !["什么", "如何", "多少", "这个", "那个"].includes(part));
  }
}
