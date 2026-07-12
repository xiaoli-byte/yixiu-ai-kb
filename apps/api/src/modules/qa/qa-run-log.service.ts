import { Injectable, Logger } from "@nestjs/common";
import { v4 as uuid } from "uuid";
import { DatabaseService } from "../../database/database.service";
import type { SearchHit } from "../search/search.service";

export interface QaRunLogInput {
  tenantId: string;
  userId?: string | null;
  conversationId?: string | null;
  question: string;
  rewrittenQuery?: string | null;
  chunks?: SearchHit[];
  answer?: string | null;
  error?: string | null;
}

/**
 * QA 运行日志：记录每轮问答的改写问题、命中片段和最终回答，供调试面板使用。
 * 复用 qa_run_logs 表；intent/domain 字段保留为通用值（行业路由已移除）。
 */
@Injectable()
export class QaRunLogService {
  private readonly logger = new Logger(QaRunLogService.name);

  constructor(private readonly db: DatabaseService) {}

  async log(input: QaRunLogInput) {
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
          "qa",
          "general",
          JSON.stringify([]),
          JSON.stringify(
            (input.chunks || []).map((chunk) => ({
              chunkId: chunk.chunkId,
              documentId: chunk.documentId,
              documentTitle: chunk.documentTitle,
              score: chunk.score,
              sources: chunk.sources,
            })),
          ),
          JSON.stringify(null),
          input.answer ?? null,
          input.error ?? null,
        ],
      );
    } catch (e: any) {
      this.logger.warn(`QA 运行日志写入失败: ${e.message}`);
    }
  }

  async listDebugRuns(
    tenantId: string,
    userId: string,
    opts: { conversationId?: string; limit?: number } = {},
  ) {
    const limit = Math.max(1, Math.min(Number.isFinite(opts.limit) ? opts.limit! : 10, 50));
    const params: any[] = [tenantId, userId];
    const where = [`tenant_id = $1`, `user_id = $2`];

    if (opts.conversationId) {
      params.push(opts.conversationId);
      where.push(`conversation_id = $${params.length}`);
    }

    params.push(limit);
    const rows = await this.db.query<{
      id: string;
      conversationId: string | null;
      question: string;
      rewrittenQuery: string | null;
      intent: string;
      domain: string;
      facts: unknown;
      chunks: unknown;
      toolResult: unknown | null;
      answer: string | null;
      error: string | null;
      createdAt: Date;
    }>(
      `SELECT id,
              conversation_id AS "conversationId",
              question,
              rewritten_query AS "rewrittenQuery",
              intent,
              domain,
              facts,
              chunks,
              tool_result AS "toolResult",
              answer,
              error,
              created_at AS "createdAt"
       FROM qa_run_logs
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    );

    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      question: row.question,
      rewrittenQuery: row.rewrittenQuery,
      intent: row.intent,
      domain: row.domain,
      facts: Array.isArray(row.facts) ? row.facts : [],
      chunks: Array.isArray(row.chunks) ? row.chunks : [],
      toolResult: row.toolResult,
      answer: row.answer,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
