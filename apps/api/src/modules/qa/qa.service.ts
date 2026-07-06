import { BadRequestException, Injectable, Logger, Inject, ForbiddenException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PRISMA } from "../../database/database.service";
import { DatabaseService } from "../../database/database.service";
import { SearchService, SearchHit } from "../search/search.service";
import { LlmService, ChatMessage } from "../llm/llm.service";
import { StorageService } from "../storage/storage.service";
import { RagFactExtractionService } from "../rag/rag-fact-extraction.service";
import { RagFactsService } from "../rag/rag-facts.service";
import { RagRouterService } from "../rag/rag-router.service";
import { RagToolsService } from "../rag/rag-tools.service";
import type {
  RagRoute,
  RagToolResult,
  StructuredFact,
  StructuredFactInput,
} from "../rag/rag.types";
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

@Injectable()
export class QaService {
  private readonly logger = new Logger(QaService.name);
  private readonly HISTORY_LIMIT = 12;
  private readonly FOLLOW_UP_PATTERN =
    /(他|她|它|他们|她们|它们|这个|那个|这些|那些|上述|上面|前面|刚才|之前|此|该|其|其中|继续|详细|展开|再说|还有|做过哪些|哪些项目|什么项目|相关项目|项目经历|经历呢|优势呢|缺点呢|区别|对比)/;
  private readonly SHORT_FOLLOW_UP_PATTERN =
    /^(有哪些|有什么|哪些|什么|为什么|怎么|如何|多少|何时|哪里|谁|总结|继续|展开|详细)/;
  private readonly CAREER_TIMELINE_PATTERN =
    /(最后一份工作|最近一份工作|当前工作|目前工作|现任|最近工作|最后工作|最后一家公司|最近一家公司|上一份工作|距今|距离现在|离现在)/;
  private readonly SYSTEM_PROMPT = `你是企业内部知识库 AI 助手。

**回答规范**
- 严格基于【参考资料】回答，引用标注使用 [1][2]...
- 若资料无答案，明确告知用户并给出合理的通用建议
- 事实依据优先级：本轮【参考资料】与【当前日期】 > 用户当前问题中的明确限定 > 历史对话；历史中的助手回答不得作为事实来源
- 如果历史助手回答与本轮参考资料或当前日期冲突，必须主动纠正历史结论
- 回答结构清晰，优先使用列表/分点方式，便于阅读
- 专业简洁，控制回答长度（一般不超过 400 字）
- 遇到表格或对比类问题，优先以表格形式呈现
- 对专业术语做简要解释，降低理解门槛

**对话上下文**
- 回答前先结合历史对话判断当前问题里的代词、省略主语和"上述/这个/他/其"等指代
- 如果当前问题是追问，沿用上文已经确定的主体、范围和限定条件，不要把问题泛化
- 问到"最后一份工作/最近一份工作/当前工作/距今多久"时，必须重新依据结构化事实或参考资料中的工作经历起止日期排序判断；除非用户明确说"这家公司/该公司/上述公司"等，不要把上一轮提到的公司当作最后一份工作
- 电商、KTV、外贸、CRM 问题必须优先使用【结构化事实】和【确定性工具结果】；涉及价格、库存、包厢、套餐、报价、交期、客户跟进、商机阶段等动态信息时，要说明资料口径和不确定性
- 若资料只包含项目类型、职责或能力描述，而没有具体项目名/客户名/上线时间，请明确说明，不要编造
- 历史对话只用于理解上下文，不作为事实来源；当前【参考资料】不足时，不要仅凭历史助手回答下结论

**无参考资料时的处理**
- 当【参考资料】标注为"（未检索到相关资料）"且历史上下文也无法回答时，先明确告知用户知识库中暂无相关内容
- 然后基于通用知识（若你确信）与合理的行业经验，给出有帮助的回答
- 建议用户尝试换一种表述方式，或上传包含相关内容的文档`;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly db: DatabaseService,
    private readonly search: SearchService,
    private readonly llm: LlmService,
    private readonly storage: StorageService,
    private readonly config: AppConfigService,
    private readonly ragRouter: RagRouterService,
    private readonly ragFacts: RagFactsService,
    private readonly ragTools: RagToolsService,
    private readonly ragExtractor: RagFactExtractionService,
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

  async getDocumentPresignedUrl(docId: string, tenantId: string, userId: string) {
    const doc = await this.findDocumentOrCanonicalUpload(docId, tenantId);
    if (!doc) throw new ForbiddenException("文档不存在");
    return {
      url: `/api/qa/documents/${encodeURIComponent(docId)}/file`,
      title: doc.title,
      mime: doc.mime,
    };
  }

  async getDocumentFile(docId: string, tenantId: string) {
    const doc = await this.findDocumentOrCanonicalUpload(docId, tenantId);
    if (!doc) throw new ForbiddenException("Document not found");
    return {
      stream: await this.storage.getObjectStream(doc.storageKey),
      title: doc.title,
      mime: doc.mime || "application/octet-stream",
    };
  }

  async getDocumentMarkdown(docId: string, tenantId: string) {
    const doc = await this.findDocumentOrCanonicalUpload(docId, tenantId);
    if (!doc) throw new ForbiddenException("文档不存在");

    // 检查是否为 Markdown 文件
    if (!doc.mime.includes("markdown") && !doc.title.toLowerCase().endsWith(".md")) {
      throw new ForbiddenException("该文档不是 Markdown 格式");
    }

    // 从存储获取文件内容
    const content = await this.storage.getObject(doc.storageKey);
    return {
      title: doc.title,
      content: content.toString("utf-8"),
      mime: doc.mime,
    };
  }

  private async findDocumentOrCanonicalUpload(id: string, tenantId: string) {
    const direct = await this.prisma.document.findFirst({
      where: { id, tenantId },
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
      where: { id: row.canonical_document_id, tenantId },
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
    onChunk: (content: string) => void;
    onCitations: (citations: Citation[]) => void;
    onNoResults: (suggestions: string[]) => void;
    onDone: (messageId: string, conversationId: string) => void;
    onError: (e: Error) => void;
  }) {
    let runRoute: RagRoute | undefined;
    let runFacts: StructuredFact[] = [];
    let runToolResult: RagToolResult | null = null;
    let runTopHits: SearchHit[] = [];
    let runRetrievalQuery = opts.question;
    let finalConvId = opts.conversationId;

    try {
      // 1. 读取历史并构建上下文感知的检索问题
      if (finalConvId) {
        await this.ensureConversationAccess(finalConvId, opts.userId, opts.tenantId);
      }
      const chatHistory = await this.loadChatHistory(finalConvId);
      const { query: retrievalQuery, usedContext } = await this.buildContextualSearchQuery(
        opts.question,
        chatHistory,
      );
      runRoute = this.ragRouter.route({
        question: opts.question,
        retrievalQuery,
        historyText: this.formatRecentHistoryForRewrite(chatHistory),
      });
      runRetrievalQuery = runRoute.retrievalQuery;

      // 2. RAG 检索
      const { hits, hasRelevantResults } = await this.search.search({
        q: runRoute.retrievalQuery,
        mode: "hybrid",
        topK: opts.topK || 5,
      });

      const topHits = hits.slice(0, opts.topK || 5);
      runTopHits = topHits;

      // 构建 citations（延迟到 LLM 完成后才发送）
      const citations: Citation[] = topHits.map((h, i) => ({
        index: i + 1,
        chunkId: h.chunkId,
        documentId: h.documentId,
        contentId: h.contentId,
        documentTitle: h.documentTitle,
        mime: h.mime,
        snippet: h.text,
        page: h.page,
      }));

      if (!hasRelevantResults) {
        // 无检索结果时，通知前端但不立即返回
        // 仍调用 LLM 生成有帮助的回复（基于通用知识）
        const suggestions = this.buildNoResultSuggestions(opts.question, runRoute.retrievalQuery);
        opts.onNoResults(suggestions);
      }

      // 3. 加载结构化事实并执行确定性工具
      const dateContext = this.getCurrentDateContext();
      runFacts = await this.loadStructuredFactsForRoute(opts.tenantId, runRoute, topHits);
      runToolResult = await this.ragTools.run({
        route: runRoute,
        facts: runFacts,
        currentDate: dateContext.isoDate,
      });

      // 4. 构建 context（空 context 时 LLM 基于通用知识回答）
      const context = citations
        .map((c, i) => `[${i + 1}] 《${c.documentTitle}》\n${c.snippet}`)
        .join("\n\n---\n\n");

      // 5. 构建 messages（含历史上下文、路由、结构化事实和工具结果）
      const retrievalHint =
        usedContext && runRetrievalQuery !== opts.question
          ? `【已根据对话上下文补全的检索问题】\n${runRetrievalQuery}\n\n`
          : "";
      const timelineHint = this.buildCareerTimelineHint(opts.question);
      const historyContext = this.buildAnswerHistoryContext(chatHistory);
      const routeContext = this.buildRagRouteContext(runRoute);
      const factContext = this.buildStructuredFactContext(runFacts);
      const toolContext = this.buildToolResultContext(runToolResult);
      const messages: ChatMessage[] = [
        { role: "system", content: this.buildSystemPrompt(dateContext) },
        {
          role: "user",
          content:
            `【当前日期】\n${dateContext.dateText}（${dateContext.timeZone}），${dateContext.dateTimeText}\n\n${routeContext}${historyContext}${factContext}${toolContext}【参考资料】\n${context || "（未检索到相关资料）"}\n\n${retrievalHint}${timelineHint}【当前问题】\n${opts.question}`,
        },
      ];

      this.logger.debug(
        `ask: domain=${runRoute.domain} intent=${runRoute.intent} facts=${runFacts.length} tool=${runToolResult?.name || "none"} hits=${topHits.length}, history=${chatHistory.length}, contextual=${usedContext}, hasRelevant=${hasRelevantResults}, query="${this.compactText(runRetrievalQuery, 120)}"`,
      );

      // 6. 创建/更新会话
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

      const userMsgId = uuid();
      await this.prisma.qAMessage.create({
        data: {
          id: userMsgId,
          conversationId: finalConvId!,
          role: "user",
          content: opts.question,
        },
      });

      await this.prisma.qAConversation.update({
        where: { id: finalConvId! },
        data: { updatedAt: new Date() },
      });

      // 7. 流式 LLM
      let full = "";
      await this.llm.streamChat(messages, {
        onChunk: (delta) => {
          full += delta;
          opts.onChunk(delta);
        },
        onDone: () => {
          // 8. 落库（此时才发送 citations，确保前端在 LLM 完成前不渲染参考资料）
          const messageId = uuid();
          this.prisma.qAMessage.create({
            data: {
              id: messageId,
              conversationId: finalConvId!,
              role: "assistant",
              content: full,
              citations: citations as any,
            },
          }).then(async () => {
            await this.ragFacts.logQaRun({
              tenantId: opts.tenantId,
              userId: opts.userId,
              conversationId: finalConvId,
              question: opts.question,
              rewrittenQuery: runRetrievalQuery,
              intent: runRoute!.intent,
              domain: runRoute!.domain,
              facts: runFacts,
              chunks: runTopHits,
              toolResult: runToolResult,
              answer: full,
            });
            opts.onCitations(citations);
            opts.onDone(messageId, finalConvId!);
          }).catch((e: Error) => {
            this.logger.error(`保存助手消息失败: ${e.message}`);
            opts.onError(e);
          });
        },
        onError: (e) => {
          this.logger.error(`LLM stream error: ${e.message}`);
        },
      });
    } catch (e: any) {
      this.logger.error(`ask error: ${e.message}`, e.stack);
      if (runRoute) {
        await this.ragFacts.logQaRun({
          tenantId: opts.tenantId,
          userId: opts.userId,
          conversationId: finalConvId,
          question: opts.question,
          rewrittenQuery: runRetrievalQuery,
          intent: runRoute.intent,
          domain: runRoute.domain,
          facts: runFacts,
          chunks: runTopHits,
          toolResult: runToolResult,
          error: e.message,
        });
      }
      opts.onError(e);
    }
  }

  private async loadChatHistory(conversationId?: string): Promise<ChatMessage[]> {
    if (!conversationId) return [];

    const rows = await this.db.query<{ role: string; content: string }>(
      `SELECT role, content FROM (
         SELECT role, content, created_at
         FROM qa_messages
         WHERE conversation_id = $1
         ORDER BY created_at DESC
         LIMIT $2
       ) recent
       ORDER BY created_at ASC`,
      [conversationId, this.HISTORY_LIMIT],
    );

    return rows
      .filter((r) => r.role === "user" || r.role === "assistant")
      .map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
  }

  private async loadStructuredFactsForRoute(
    tenantId: string,
    route: RagRoute,
    hits: SearchHit[],
  ): Promise<StructuredFact[]> {
    if (!route.requiresFacts) return [];

    const documentIds = [...new Set(hits.map((hit) => hit.documentId))];
    try {
      const storedFacts = await this.ragFacts.findFacts({
        tenantId,
        domain: route.domain,
        entityTypes: route.profile.factEntityTypes,
        query: `${route.originalQuestion} ${route.retrievalQuery}`,
        documentIds: documentIds.length > 0 ? documentIds : undefined,
        limit: 24,
      });
      if (storedFacts.length > 0) return storedFacts;
    } catch (e: any) {
      this.logger.warn(`结构化事实查询失败，降级为本轮片段抽取: ${e.message}`);
    }

    const runtimeFacts = await this.ragExtractor.extractFactsFromSearchHits({
      tenantId,
      domainHint: route.domain,
      hits,
    });
    return runtimeFacts.map((fact, index) => this.toRuntimeFact(fact, hits, index));
  }

  private toRuntimeFact(
    fact: StructuredFactInput,
    hits: SearchHit[],
    index: number,
  ): StructuredFact {
    const hit =
      hits.find((item) => item.chunkId === fact.chunkId) ||
      hits.find((item) => item.documentId === fact.documentId);
    return {
      ...fact,
      id: `runtime-${index + 1}`,
      documentTitle: hit?.documentTitle,
      mime: hit?.mime,
      page: hit?.page ?? null,
    };
  }

  private buildRagRouteContext(route: RagRoute) {
    const policy = route.profile.answerPolicy.map((item) => `- ${item}`).join("\n");
    const warnings =
      route.warnings.length > 0
        ? `\n高风险约束：\n${route.warnings.map((item) => `- ${item}`).join("\n")}`
        : "";
    return [
      "【RAG路由】",
      `领域：${route.profile.displayName}（${route.domain}）`,
      `意图：${route.intent}`,
      `风险等级：${route.profile.riskLevel}`,
      "行业回答策略：",
      policy,
      warnings,
      "",
    ].join("\n");
  }

  private buildStructuredFactContext(facts: StructuredFact[]) {
    if (facts.length === 0) {
      return "【结构化事实】\n（未命中结构化事实；请优先依据参考资料，资料不足时说明不足）\n\n";
    }
    const lines = facts.slice(0, 16).map((fact, i) => {
      const attrs = this.compactText(JSON.stringify(fact.attributes || {}), 260);
      const source = fact.documentTitle ? `《${fact.documentTitle}》` : fact.documentId;
      return `[F${i + 1}] ${fact.domain}/${fact.entityType}/${fact.entityName}，属性：${attrs}，来源：${source}，证据：${this.compactText(fact.sourceText, 220)}`;
    });
    return [
      "【结构化事实】",
      "以下事实来自文档抽取或本轮参考资料抽取，优先级高于历史对话；关键结论必须能回到这些事实或参考资料。",
      ...lines,
      "",
    ].join("\n");
  }

  private buildToolResultContext(toolResult: RagToolResult | null) {
    if (!toolResult) return "";
    const evidence = toolResult.evidence
      .slice(0, 8)
      .map((item, i) => {
        const source = item.documentTitle ? `《${item.documentTitle}》` : item.documentId || "";
        return `[T${i + 1}] ${source} ${this.compactText(item.sourceText, 180)}`;
      })
      .join("\n");
    return [
      "【确定性工具结果】",
      `工具：${toolResult.name}`,
      `结论：${toolResult.summary}`,
      `结构化数据：${this.compactText(JSON.stringify(toolResult.data || {}), 900)}`,
      evidence ? `证据：\n${evidence}` : "",
      "",
    ].join("\n");
  }

  private async ensureConversationAccess(id: string, userId: string, tenantId: string) {
    const conv = await this.prisma.qAConversation.findFirst({
      where: { id, userId, tenantId },
      select: { id: true },
    });
    if (!conv) throw new ForbiddenException("会话不存在或无权访问");
  }

  private async buildContextualSearchQuery(
    question: string,
    history: ChatMessage[],
  ): Promise<{ query: string; usedContext: boolean }> {
    const normalizedQuestion = this.compactText(question, 300);
    if (!this.shouldUseContextualSearch(normalizedQuestion, history)) {
      return { query: normalizedQuestion, usedContext: false };
    }

    if (this.isCareerTimelineQuestion(normalizedQuestion)) {
      return {
        query: this.buildCareerTimelineSearchQuery(normalizedQuestion, history),
        usedContext: history.length > 0,
      };
    }

    const fallbackQuery = this.buildHeuristicSearchQuery(normalizedQuestion, history);
    if (this.llm.isMock) {
      return { query: fallbackQuery, usedContext: true };
    }

    try {
      const rewritten = await this.llm.chat(
        [
          {
            role: "system",
            content:
              "你是企业知识库检索查询改写器。请基于最近对话，把当前追问改写成一个可独立检索的中文问题或关键词串。只补全省略的主体、对象、时间和限定条件，不回答问题，不新增未知事实。若当前问题询问最后一份工作、最近工作、当前工作或距今多久，只继承人物主体，不要继承上一轮提到的公司名；应检索完整工作经历和起止日期。只输出一行。",
          },
          {
            role: "user",
            content: `最近对话：\n${this.formatRecentHistoryForRewrite(history)}\n\n当前问题：${normalizedQuestion}`,
          },
        ],
        { temperature: 0, topP: 0.2, maxTokens: 120 },
      );
      const query = this.cleanStandaloneQuery(rewritten);
      if (query) return { query, usedContext: true };
    } catch (e: any) {
      this.logger.warn(`上下文检索问题改写失败，使用本地补全: ${e.message}`);
    }

    return { query: fallbackQuery, usedContext: true };
  }

  private shouldUseContextualSearch(question: string, history: ChatMessage[]) {
    if (history.length === 0) return false;
    const compact = question.replace(/\s+/g, "");
    return (
      this.FOLLOW_UP_PATTERN.test(compact) ||
      (compact.length <= 18 && this.SHORT_FOLLOW_UP_PATTERN.test(compact))
    );
  }

  private isCareerTimelineQuestion(question: string) {
    return this.CAREER_TIMELINE_PATTERN.test(question.replace(/\s+/g, ""));
  }

  private buildCareerTimelineSearchQuery(question: string, history: ChatMessage[]) {
    const subject = this.extractConversationSubject(question, history);
    return this.compactText(
      [
        subject,
        "简历 工作经历 任职经历 公司 起止时间 时间线 最后一份工作 最近一份工作 当前工作",
        question,
      ]
        .filter(Boolean)
        .join(" "),
      500,
    );
  }

  private buildCareerTimelineHint(question: string) {
    if (!this.isCareerTimelineQuestion(question)) return "";
    return [
      "【时间线判断要求】",
      "当前问题涉及职业经历时间线。请先从参考资料中列出候选工作经历及起止日期，再按结束日期/当前任职状态判断最后一份或最近一份工作。",
      "不要因为上一轮问过某家公司，就把该公司当作最后一份工作；只有用户明确指定该公司时才按该公司回答。",
      "",
    ].join("\n");
  }

  private extractConversationSubject(question: string, history: ChatMessage[]) {
    const texts = [question, ...history.slice().reverse().map((m) => m.content)];
    for (const text of texts) {
      const match =
        text.match(/([\u4e00-\u9fa5]{2,4})是谁/) ||
        text.match(/^([\u4e00-\u9fa5]{2,4})是(?:一位|一个|[0-9]+|[\u4e00-\u9fa5]+的)/) ||
        text.match(/(?:关于|查询|分析)([\u4e00-\u9fa5]{2,4})(?:的|简历|工作|项目)/);
      if (match?.[1]) {
        return match[1];
      }
    }
    return "";
  }

  private buildHeuristicSearchQuery(question: string, history: ChatMessage[]) {
    const recentUser = [...history].reverse().find((m) => m.role === "user")?.content;
    const recentAssistant = [...history].reverse().find((m) => m.role === "assistant")?.content;
    const parts = [
      recentUser ? `上一轮问题：${this.compactText(recentUser, 120)}` : "",
      recentAssistant ? `上一轮回答：${this.compactText(recentAssistant, 180)}` : "",
      `当前追问：${question}`,
    ].filter(Boolean);
    return this.compactText(parts.join("\n"), 500);
  }

  private buildAnswerHistoryContext(history: ChatMessage[]) {
    if (history.length === 0) return "";
    const lines = history.slice(-6).map((m) => {
      const role = m.role === "user" ? "用户" : "助手";
      return `${role}: ${this.compactText(m.content, m.role === "user" ? 120 : 160)}`;
    });
    return [
      "【历史对话】",
      "以下历史只用于理解代词、追问对象和用户意图，不是事实依据；如与【参考资料】或【当前日期】冲突，必须以本轮参考资料和当前日期为准。",
      ...lines,
      "",
    ].join("\n");
  }

  private formatRecentHistoryForRewrite(history: ChatMessage[]) {
    return history
      .slice(-6)
      .map((m) => `${m.role === "user" ? "用户" : "助手"}：${this.compactText(m.content, 180)}`)
      .join("\n");
  }

  private cleanStandaloneQuery(raw: string) {
    const firstLine = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (!firstLine) return "";
    const withoutLabel = firstLine
      .replace(/^[-*\d.、\s]+/, "")
      .replace(/^(独立问题|检索问题|改写后问题|问题|关键词串)[:：]\s*/, "")
      .replace(/^["'`“”]+|["'`“”]+$/g, "");
    return this.compactText(withoutLabel, 300);
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
    const focus = this.extractSuggestionFocus(retrieval || original) || "this topic";
    const candidates = [
      `Search exact keywords: ${focus}`,
      `Which uploaded documents mention ${focus}?`,
      `Summarize any records related to ${focus}.`,
      `Broaden the question: what information is available about ${focus}?`,
      `Try related terms for ${focus}.`,
    ];
    const seen = new Set<string>([original.toLowerCase()]);
    return candidates.filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 5);
  }

  private extractSuggestionFocus(text: string) {
    const tokens = text.match(/[A-Za-z0-9][A-Za-z0-9/_+-]{1,30}|[\u4e00-\u9fa5]{2,12}/g) || [];
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const token of tokens) {
      const key = token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(token);
      if (unique.length >= 8) break;
    }
    return this.compactText(unique.join(" ") || text, 120);
  }

  private compactText(text: string, maxLength: number) {
    const compact = text
      .replace(/<[^>]+>/g, " ")
      .replace(/\[[0-9]+\]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return compact.length > maxLength ? compact.slice(0, maxLength) : compact;
  }

  private buildSystemPrompt(dateContext = this.getCurrentDateContext()) {
    return `${this.SYSTEM_PROMPT}

**当前日期与时间计算**
- 当前日期：${dateContext.dateText}，当前时间：${dateContext.dateTimeText}（时区：${dateContext.timeZone}）
- 遇到"今天"、"现在"、"当前"、"今年"、"最近"、"距离现在"、"最后一份工作距今多久"等相对时间问题，必须以这个当前日期为唯一基准计算
- 不要使用模型训练时间、知识截止时间、文档生成时间或示例年份作为当前日期
- 如果历史对话中曾出现不同的"当前日期/当前年份"，必须忽略旧值，并以本轮【当前日期】为准主动纠正
- 如果参考资料中的结束日期早于当前日期，按已经结束计算；如果结束日期晚于当前日期，明确说明该资料时间在未来或可能存在录入错误
- 时间跨度请优先给出精确起止日期和年/月差，不确定时说明口径

**RAG 控制层**
- 回答优先级：当前日期/确定性工具结果/结构化事实 > 本轮参考资料 > 用户当前问题中的明确限定 > 历史对话
- 结构化事实和工具结果若与参考资料冲突，请指出冲突并以可追溯证据更完整的一方为准
- 对电商、KTV、外贸、CRM 场景，必须区分"资料明确写明"、"工具整理得出"和"通用业务建议"`;
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
