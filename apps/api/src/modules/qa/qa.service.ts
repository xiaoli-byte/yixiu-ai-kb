import { BadRequestException, Injectable, Logger, Inject, ForbiddenException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PRISMA } from "../../database/database.service";
import { DatabaseService } from "../../database/database.service";
import { SearchService, SearchHit } from "../search/search.service";
import { LlmService, ChatMessage } from "../llm/llm.service";
import { StorageService } from "../storage/storage.service";
import { RerankService } from "../embeddings/rerank.service";
import {
  DocumentAccessService,
  type DocumentUserContext,
} from "../documents/document-access.service";
import { ConversationMemoryService, ConversationMemory } from "./conversation-memory.service";
import { QueryPlannerService } from "./query-planner.service";
import { QaRunLogService } from "./qa-run-log.service";
import { v4 as uuid } from "uuid";
import { AppConfigService } from "../../config/app-config.service";

export interface Citation {
  index: number;
  chunkId: string;
  documentId: string;
  contentId?: string;
  documentTitle: string;
  mime: string;        // 文档 MIME 类型
  snippet: string;
  page: number | null;  // PDF 页码
}

export type QAMessageFeedbackRating = "up" | "down" | "none";

export interface QAMessageFeedback {
  rating: QAMessageFeedbackRating;
  text: string | null;
  updatedAt: string | null;
}

interface FeedbackRow {
  feedbackRating: string | null;
  feedbackText: string | null;
  feedbackAt: Date | string | null;
}

interface QAMessageRow extends FeedbackRow {
  id: string;
  role: string;
  content: string;
  citations: unknown;
  createdAt: Date;
}

type QaUserInput =
  | string
  | (Partial<DocumentUserContext> & { sub?: string; id?: string });

/**
 * AI 问答主管道：会话记忆 → 查询规划 → 混合召回 → 权限过滤 → 重排 → 多轮生成 → 持久化。
 */
@Injectable()
export class QaService {
  private readonly logger = new Logger(QaService.name);

  /** 送入重排的最大候选数 */
  private readonly MAX_RECALL_CANDIDATES = 50;
  /** 重排相关性分数下限，低于此值的候选不进入参考资料 */
  private readonly RERANK_MIN_SCORE = 0.2;

  private readonly SYSTEM_PROMPT = `你是企业内部知识库 AI 助手。

**回答规范**
- 严格基于【参考资料】回答，引用标注使用 [1][2]...；关键结论必须能对应到具体资料
- 资料没有答案时，先明确告知知识库中暂无相关内容，再基于通用知识给出有帮助的建议，并与资料事实分开表述
- 历史对话（含背景摘要）只用于理解代词、追问对象和用户意图，不作为事实来源；历史结论与本轮参考资料冲突时，以本轮参考资料为准并主动纠正
- 回答结构清晰，优先使用列表/分点；对比类问题优先使用表格；专业术语做简要解释
- 保持专业简洁，避免冗长铺陈

**时间计算**
- "今天/现在/最近/距今"等相对时间，一律以【当前日期】为基准计算，不要使用训练数据时间或历史对话中出现过的旧日期`;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly db: DatabaseService,
    private readonly search: SearchService,
    private readonly llm: LlmService,
    private readonly storage: StorageService,
    private readonly access: DocumentAccessService,
    private readonly config: AppConfigService,
    private readonly rerank: RerankService,
    private readonly memory: ConversationMemoryService,
    private readonly planner: QueryPlannerService,
    private readonly runLog: QaRunLogService,
  ) {}

  async listConversations(userId: string, tenantId: string) {
    return this.prisma.qAConversation.findMany({
      where: { userId, tenantId },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { messages: true } } },
    });
  }

  async getConversation(id: string, userId: string, tenantId?: string) {
    const conv = await this.prisma.qAConversation.findFirst({
      where: { id, userId, ...(tenantId ? { tenantId } : {}) },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    if (!conv) return null;
    const messages = await this.db.query<QAMessageRow>(
      `SELECT id,
              role,
              content,
              citations,
              feedback_rating AS "feedbackRating",
              feedback_text AS "feedbackText",
              feedback_at AS "feedbackAt",
              created_at AS "createdAt"
       FROM qa_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [id],
    );
    return {
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
      messageCount: messages.length,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        citations: (m.citations as unknown as Citation[]) || [],
        feedback: this.normalizeFeedback(m),
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async updateMessageFeedback(input: {
    messageId: string;
    tenantId: string;
    userId: string;
    rating: string;
    feedbackText?: string | null;
  }): Promise<QAMessageFeedback> {
    const rating = this.normalizeFeedbackRating(input.rating);
    const text = rating === "none" ? null : this.normalizeFeedbackText(input.feedbackText);
    const message = await this.db.queryOne<{ id: string; role: string }>(
      `SELECT m.id, m.role
       FROM qa_messages m
       JOIN qa_conversations c ON c.id = m.conversation_id
       WHERE m.id = $1
         AND c.user_id = $2
         AND c.tenant_id = $3`,
      [input.messageId, input.userId, input.tenantId],
    );

    if (!message) {
      throw new ForbiddenException("Message not found or access denied");
    }
    if (message.role !== "assistant") {
      throw new BadRequestException("Feedback is only allowed for assistant messages");
    }

    const persistedRating = rating === "none" ? null : rating;
    const updated = await this.db.queryOne<FeedbackRow>(
      `UPDATE qa_messages
       SET feedback_rating = $2,
           feedback_text = $3,
           feedback_at = CASE WHEN $2 IS NULL THEN NULL ELSE NOW() END
       WHERE id = $1
       RETURNING feedback_rating AS "feedbackRating",
                 feedback_text AS "feedbackText",
                 feedback_at AS "feedbackAt"`,
      [input.messageId, persistedRating, text],
    );

    return this.normalizeFeedback(updated);
  }

  async getChunk(id: string) {
    const rows = await this.db.query<{ text: string }>(
      `SELECT text FROM chunks WHERE id = $1`,
      [id],
    );
    if (!rows[0]) return { text: "" };
    return { text: rows[0].text };
  }

  async listDebugRuns(
    tenantId: string,
    userId: string,
    opts: { conversationId?: string; limit?: number } = {},
  ) {
    return this.runLog.listDebugRuns(tenantId, userId, opts);
  }

  async getDocumentPresignedUrl(docId: string, tenantId: string, user: QaUserInput) {
    const doc = await this.findDocumentOrCanonicalUpload(docId, tenantId);
    if (doc) {
      await this.access.assertDocumentAccess(
        doc.id,
        "VIEW",
        await this.buildDocumentUserContext(tenantId, user),
      );
    }
    if (!doc) throw new ForbiddenException("文档不存在");
    return {
      url: `/api/qa/documents/${encodeURIComponent(docId)}/file`,
      title: doc.title,
      mime: doc.mime,
    };
  }

  async getDocumentFile(docId: string, tenantId: string, user: QaUserInput) {
    const doc = await this.findDocumentOrCanonicalUpload(docId, tenantId);
    if (doc) {
      await this.access.assertDocumentAccess(
        doc.id,
        "DOWNLOAD",
        await this.buildDocumentUserContext(tenantId, user),
      );
    }
    if (!doc) throw new ForbiddenException("Document not found");
    return {
      stream: await this.storage.getObjectStream(doc.storageKey),
      title: doc.title,
      mime: doc.mime || "application/octet-stream",
    };
  }

  async getDocumentMarkdown(docId: string, tenantId: string, user: QaUserInput) {
    const doc = await this.findDocumentOrCanonicalUpload(docId, tenantId);
    if (doc) {
      await this.access.assertDocumentAccess(
        doc.id,
        "VIEW",
        await this.buildDocumentUserContext(tenantId, user),
      );
    }
    if (!doc) throw new ForbiddenException("文档不存在");

    // 检查是否为 Markdown 文件
    if (!doc.mime.includes("markdown") && !doc.title.toLowerCase().endsWith(".md")) {
      throw new ForbiddenException("该文档不是 Markdown 格式");
    }

    const content = await this.storage.getObject(doc.storageKey);
    return {
      title: doc.title,
      content: content.toString("utf-8"),
      mime: doc.mime,
    };
  }

  private async findDocumentOrCanonicalUpload(id: string, tenantId: string) {
    const direct = await this.prisma.document.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (direct) return direct;

    const row = await this.db.queryOne<{ canonical_document_id: string | null }>(
      `SELECT canonical_document_id
       FROM document_contents
       WHERE id=$1 AND tenant_id=$2`,
      [id, tenantId],
    );
    if (!row?.canonical_document_id) return null;

    return this.prisma.document.findFirst({
      where: { id: row.canonical_document_id, tenantId, deletedAt: null },
    });
  }

  async deleteConversation(id: string, userId: string) {
    await this.prisma.qAConversation.deleteMany({ where: { id, userId } });
    return { id };
  }

  async ask(opts: {
    userId: string;
    tenantId: string;
    conversationId?: string;
    question: string;
    topK?: number;
    user?: QaUserInput;
    role?: string;
    departmentId?: string | null;
    onChunk: (content: string) => void;
    onCitations: (citations: Citation[]) => void;
    onNoResults: (suggestions: string[]) => void;
    onDone: (messageId: string, conversationId: string) => void;
    onError: (e: Error) => void;
  }) {
    let retrievalQuery = opts.question;
    let topHits: SearchHit[] = [];
    let finalConvId = opts.conversationId;

    try {
      // 1. 会话记忆（滚动摘要 + 最近轮次全文）
      if (finalConvId) {
        await this.ensureConversationAccess(finalConvId, opts.userId, opts.tenantId);
      }
      const memory = await this.memory.load(finalConvId);

      // 2. 查询规划：有历史时每轮改写为可独立检索的问题
      const plan = await this.planner.plan(opts.question, memory);
      retrievalQuery = plan.retrievalQuery;

      const actor = await this.buildDocumentUserContext(
        opts.tenantId,
        opts.user ?? {
          userId: opts.userId,
          role: opts.role,
          departmentId: opts.departmentId,
        },
      );
      const requestedTopK = Math.max(1, Math.min(opts.topK || 5, 20));
      const recallTopK = Math.min(
        Math.max(requestedTopK * 6, 30),
        this.MAX_RECALL_CANDIDATES,
      );

      // 3. 混合召回（干净的改写问题，不拼接 boost 词，避免污染向量语义）
      const { hits } = await this.search.search({
        q: retrievalQuery,
        mode: "hybrid",
        topK: recallTopK,
        user: actor,
      });

      // 4. 权限 + AI 引用开关过滤
      const accessibleHits = await this.filterRecallHits(hits, opts.tenantId, actor);

      // 5. 重排精选（失败降级为召回原序）
      const filteredHits = await this.rerankHits(retrievalQuery, accessibleHits, requestedTopK);
      topHits = filteredHits;

      const citations: Citation[] = filteredHits.map((h, i) => ({
        index: i + 1,
        chunkId: h.chunkId,
        documentId: h.documentId,
        contentId: h.contentId,
        documentTitle: h.documentTitle,
        mime: h.mime,
        snippet: h.text,
        page: h.page,
      }));

      if (citations.length === 0) {
        // 无检索结果时通知前端展示改写建议，但仍让 LLM 基于通用知识作答
        opts.onNoResults(this.buildNoResultSuggestions(opts.question, retrievalQuery));
      }

      // 6. 构建真正的多轮 messages
      const messages = this.buildChatMessages({
        question: opts.question,
        memory,
        citations,
        retrievalQuery,
        usedContext: plan.usedContext,
      });

      this.logger.debug(
        `ask: hits=${filteredHits.length}/${accessibleHits.length}/${hits.length}, history=${memory.recentMessages.length}, summary=${memory.summary ? "yes" : "no"}, contextual=${plan.usedContext}, query="${this.compactText(retrievalQuery, 120)}"`,
      );

      // 7. 创建/更新会话，保存用户消息
      if (!finalConvId) {
        const conv = await this.prisma.qAConversation.create({
          data: {
            id: uuid(),
            userId: opts.userId,
            tenantId: opts.tenantId,
            title: opts.question.slice(0, 30),
          },
        });
        finalConvId = conv.id;
      }

      await this.prisma.qAMessage.create({
        data: {
          id: uuid(),
          conversationId: finalConvId!,
          role: "user",
          content: opts.question,
        },
      });

      await this.prisma.qAConversation.update({
        where: { id: finalConvId! },
        data: { updatedAt: new Date() },
      });

      // 8. 流式生成（streamChat 内部出错会 throw，由外层 catch 统一上报前端）
      const full = await this.llm.streamChat(messages, {
        onChunk: (delta) => opts.onChunk(delta),
      });

      // 9. 落库 + 运行日志 + 通知前端（citations 在生成完成后才发送）
      const messageId = uuid();
      await this.prisma.qAMessage.create({
        data: {
          id: messageId,
          conversationId: finalConvId!,
          role: "assistant",
          content: full,
          citations: citations as any,
        },
      });
      await this.runLog.log({
        tenantId: opts.tenantId,
        userId: opts.userId,
        conversationId: finalConvId,
        question: opts.question,
        rewrittenQuery: retrievalQuery,
        chunks: topHits,
        answer: full,
      });
      if (citations.length > 0) {
        opts.onCitations(citations);
      }
      opts.onDone(messageId, finalConvId!);

      // 10. 异步维护滚动摘要（不阻塞响应，失败只记日志）
      void this.memory.maybeUpdateSummary(finalConvId!);
    } catch (e: any) {
      this.logger.error(`ask error: ${e.message}`, e.stack);
      await this.runLog.log({
        tenantId: opts.tenantId,
        userId: opts.userId,
        conversationId: finalConvId,
        question: opts.question,
        rewrittenQuery: retrievalQuery,
        chunks: topHits,
        error: e.message,
      });
      opts.onError(e);
    }
  }

  /** 重排候选片段；失败或 mock 时降级为召回原序 */
  private async rerankHits(
    query: string,
    hits: SearchHit[],
    topK: number,
  ): Promise<SearchHit[]> {
    if (hits.length <= 1) return hits.slice(0, topK);

    try {
      const documents = hits.map((h) => `《${h.documentTitle}》\n${h.text}`);
      const results = await this.rerank.rerank(query, documents, Math.min(topK * 2, hits.length));
      const reranked = results
        .filter((item) => item.index < hits.length)
        .filter((item) => item.score >= this.RERANK_MIN_SCORE)
        .map((item) => ({ ...hits[item.index], score: item.score }))
        .slice(0, topK);
      // 阈值过滤后全空时，保底取重排第一名，避免明明有召回却回答"无资料"
      if (reranked.length === 0 && results.length > 0) {
        const best = results[0];
        if (best.index < hits.length) {
          return [{ ...hits[best.index], score: best.score }];
        }
      }
      return reranked;
    } catch (e: any) {
      this.logger.warn(`重排失败，降级为召回原始排序: ${e.message}`);
      return hits.slice(0, topK);
    }
  }

  /** 构建多轮对话 messages：system（含摘要与当前日期）+ 历史轮次原文 + 本轮问题（含参考资料） */
  private buildChatMessages(input: {
    question: string;
    memory: ConversationMemory;
    citations: Citation[];
    retrievalQuery: string;
    usedContext: boolean;
  }): ChatMessage[] {
    const dateContext = this.getCurrentDateContext();
    const systemParts = [
      this.SYSTEM_PROMPT,
      `\n**当前日期**\n${dateContext.dateText}（${dateContext.timeZone}），${dateContext.dateTimeText}`,
    ];
    if (input.memory.summary) {
      systemParts.push(
        `\n**对话背景摘要**（此前对话的压缩记录，仅用于理解上下文，不作为事实来源）\n${input.memory.summary}`,
      );
    }

    const context = input.citations
      .map((c, i) => `[${i + 1}] 《${c.documentTitle}》${c.page != null ? `（第${c.page}页）` : ""}\n${c.snippet}`)
      .join("\n\n---\n\n");

    const retrievalHint =
      input.usedContext && input.retrievalQuery !== input.question
        ? `\n\n【检索用的完整问题】\n${input.retrievalQuery}`
        : "";

    return [
      { role: "system", content: systemParts.join("\n") },
      ...input.memory.recentMessages,
      {
        role: "user",
        content: `【参考资料】\n${context || "（未检索到相关资料）"}${retrievalHint}\n\n【当前问题】\n${input.question}`,
      },
    ];
  }

  private async filterRecallHits(
    hits: SearchHit[],
    tenantId: string,
    actor: DocumentUserContext,
  ): Promise<SearchHit[]> {
    const documentIds = [...new Set(hits.map((hit) => hit.documentId).filter(Boolean))];
    if (documentIds.length === 0) return [];

    const [flags, aiReferenceFlags] = await Promise.all([
      this.access.getAccessFlags(documentIds, actor),
      this.loadAiReferenceFlags(documentIds, tenantId),
    ]);

    return hits.filter((hit) => {
      const canView = flags[hit.documentId]?.canView ?? false;
      const aiReferenceEnabled = aiReferenceFlags.get(hit.documentId) ?? false;
      return canView && aiReferenceEnabled;
    });
  }

  private async loadAiReferenceFlags(documentIds: string[], tenantId: string) {
    const flags = new Map(documentIds.map((documentId) => [documentId, false]));
    if (documentIds.length === 0) return flags;

    const rows = await this.db.query<{
      id: string;
      aiReferenceEnabled?: boolean;
      ai_reference_enabled?: boolean;
    }>(
      `SELECT id, ai_reference_enabled AS "aiReferenceEnabled"
       FROM documents
       WHERE tenant_id = $1
         AND deleted_at IS NULL
         AND id = ANY($2::text[])`,
      [tenantId, documentIds],
    );

    for (const row of rows) {
      flags.set(row.id, Boolean(row.aiReferenceEnabled ?? row.ai_reference_enabled));
    }
    return flags;
  }

  private async ensureConversationAccess(id: string, userId: string, tenantId: string) {
    const conv = await this.prisma.qAConversation.findFirst({
      where: { id, userId, tenantId },
      select: { id: true },
    });
    if (!conv) throw new ForbiddenException("会话不存在或无权访问");
  }

  private normalizeFeedback(row?: FeedbackRow | null): QAMessageFeedback {
    const rating =
      row?.feedbackRating === "up" || row?.feedbackRating === "down"
        ? row.feedbackRating
        : "none";
    const updatedAt = row?.feedbackAt ? new Date(row.feedbackAt).toISOString() : null;
    return {
      rating,
      text: row?.feedbackText || null,
      updatedAt,
    };
  }

  private normalizeFeedbackRating(rating: string): QAMessageFeedbackRating {
    if (rating === "up" || rating === "down" || rating === "none") {
      return rating;
    }
    throw new BadRequestException("rating must be one of: up, down, none");
  }

  private normalizeFeedbackText(text?: string | null) {
    const normalized = (text || "").trim();
    return normalized ? normalized.slice(0, 2000) : null;
  }

  private buildNoResultSuggestions(question: string, retrievalQuery?: string) {
    const original = this.compactText(question, 180);
    const retrieval = this.compactText(retrievalQuery || question, 180);
    const focus = this.extractSuggestionFocus(retrieval || original) || "该主题";
    const candidates = [
      `用更具体的关键词检索：${focus}`,
      `哪些已上传的文档提到了${focus}？`,
      `总结知识库中与${focus}相关的内容`,
      `换一种表述：关于${focus}有哪些资料？`,
    ];
    const seen = new Set<string>([original.toLowerCase()]);
    return candidates.filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 4);
  }

  private extractSuggestionFocus(text: string) {
    const tokens = text.match(/[A-Za-z0-9][A-Za-z0-9/_+-]{1,30}|[一-龥]{2,12}/g) || [];
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const token of tokens) {
      const key = token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(token);
      if (unique.length >= 6) break;
    }
    return this.compactText(unique.join(" ") || text, 80);
  }

  private async buildDocumentUserContext(
    tenantId: string,
    user?: QaUserInput,
  ): Promise<DocumentUserContext> {
    const raw = typeof user === "string" ? { userId: user } : (user ?? {});
    const userId = raw.userId ?? raw.sub ?? raw.id ?? this.db.userId ?? "";
    const userTenantId = raw.tenantId ?? tenantId ?? this.db.tenantId ?? "";
    const fallbackRole = this.safeFallbackRole(raw.role ?? (this.db as any).role);
    let role = fallbackRole;
    let departmentId = raw.departmentId ?? null;

    if (userId && userTenantId) {
      const storedUser = await this.prisma.user.findFirst({
        where: { id: userId, tenantId: userTenantId },
        select: { role: true, departmentId: true },
      });
      role = storedUser?.role ?? fallbackRole;
      departmentId = storedUser ? storedUser.departmentId ?? null : null;
    }

    return {
      userId,
      tenantId: userTenantId,
      role,
      departmentId,
    };
  }

  private safeFallbackRole(role?: string | null) {
    if (role === "admin" || role === "super_admin") return "viewer";
    return role ?? "viewer";
  }

  private compactText(text: string, maxLength: number) {
    const compact = text
      .replace(/<[^>]+>/g, " ")
      .replace(/\[[0-9]+\]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return compact.length > maxLength ? compact.slice(0, maxLength) : compact;
  }

  private getCurrentDateContext() {
    const timeZone = this.config.appTimeZone;
    const now = new Date();
    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const part = (type: string) => parts.find((p) => p.type === type)?.value || "";
    const dateText = `${part("year")}年${part("month")}月${part("day")}日`;
    const isoDate = `${part("year")}-${part("month")}-${part("day")}`;
    const dateTimeText = `${isoDate} ${part("hour")}:${part("minute")}:${part("second")}`;
    return { timeZone, dateText, dateTimeText, isoDate };
  }
}
