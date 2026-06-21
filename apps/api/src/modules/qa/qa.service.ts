import { Injectable, Logger, Inject, ForbiddenException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PRISMA } from "../../database/database.service";
import { DatabaseService } from "../../database/database.service";
import { SearchService, SearchHit } from "../search/search.service";
import { LlmService, ChatMessage } from "../llm/llm.service";
import { StorageService } from "../storage/storage.service";
import { v4 as uuid } from "uuid";

export interface Citation {
  index: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  mime: string;        // 文档 MIME 类型
  snippet: string;
  page: number | null;  // PDF 页码
}

@Injectable()
export class QaService {
  private readonly logger = new Logger(QaService.name);
  private readonly SYSTEM_PROMPT = `你是企业内部知识库 AI 助手。

**回答规范**
- 严格基于【参考资料】回答，引用标注使用 [1][2]...
- 若资料无答案，明确告知用户并给出合理的通用建议
- 回答结构清晰，优先使用列表/分点方式，便于阅读
- 专业简洁，控制回答长度（一般不超过 400 字）
- 遇到表格或对比类问题，优先以表格形式呈现
- 对专业术语做简要解释，降低理解门槛

**无参考资料时的处理**
- 当【参考资料】标注为"（未检索到相关资料）"时，先明确告知用户知识库中暂无相关内容
- 然后基于通用知识（若你确信）与合理的行业经验，给出有帮助的回答
- 建议用户尝试换一种表述方式，或上传包含相关内容的文档`;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly db: DatabaseService,
    private readonly search: SearchService,
    private readonly llm: LlmService,
    private readonly storage: StorageService,
  ) {}

  async listConversations(userId: string, tenantId: string) {
    return this.prisma.qAConversation.findMany({
      where: { userId, tenantId },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { messages: true } } },
    });
  }

  async getConversation(id: string, userId: string) {
    const conv = await this.prisma.qAConversation.findFirst({
      where: { id, userId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!conv) return null;
    return {
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
      messageCount: conv.messages.length,
      messages: conv.messages.map((m) => ({
        id: m.id,
        role: m.role as any,
        content: m.content,
        citations: (m.citations as any) || [],
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async getChunk(id: string) {
    const rows = await this.db.query<{ text: string }>(
      `SELECT text FROM chunks WHERE id = $1`,
      [id],
    );
    if (!rows[0]) return { text: "" };
    return { text: rows[0].text };
  }

  async getDocumentPresignedUrl(docId: string, tenantId: string, userId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: docId, tenantId },
    });
    if (!doc) throw new ForbiddenException("文档不存在");
    const url = await this.storage.presignedGet(doc.storageKey, 3600);
    return {
      url,
      title: doc.title,
      mime: doc.mime,
    };
  }

  async getDocumentMarkdown(docId: string, tenantId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: docId, tenantId },
    });
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
    onNoResults: () => void;
    onDone: (messageId: string, conversationId: string) => void;
    onError: (e: Error) => void;
  }) {
    try {
      // 1. RAG 检索
      const { hits, hasRelevantResults } = await this.search.search({
        q: opts.question,
        mode: "hybrid",
        topK: opts.topK || 5,
      });

      const topHits = hits.slice(0, opts.topK || 5);

      // 构建 citations（延迟到 LLM 完成后才发送）
      const citations: Citation[] = topHits.map((h, i) => ({
        index: i + 1,
        chunkId: h.chunkId,
        documentId: h.documentId,
        documentTitle: h.documentTitle,
        mime: h.mime,
        snippet: h.text,
        page: h.page,
      }));

      if (!hasRelevantResults) {
        // 无检索结果时，通知前端但不立即返回
        // 仍调用 LLM 生成有帮助的回复（基于通用知识）
        opts.onNoResults();
      }

      // 2. 构建 context（空 context 时 LLM 基于通用知识回答）
      const context = citations
        .map((c, i) => `[${i + 1}] 《${c.documentTitle}》\n${c.snippet}`)
        .join("\n\n---\n\n");

      // 3. 构建 messages（含历史上下文）
      const conversationId = opts.conversationId;
      let chatHistory: ChatMessage[] = [];

      if (conversationId) {
        const rows = await this.db.query<{ role: string; content: string }>(
          `SELECT role, content FROM qa_messages
           WHERE conversation_id = $1
           ORDER BY created_at ASC
           LIMIT 20`,
          [conversationId],
        );
        chatHistory = rows.map((r) => ({ role: r.role as any, content: r.content }));
      }

      const messages: ChatMessage[] = [
        { role: "system", content: this.SYSTEM_PROMPT },
        ...chatHistory,
        {
          role: "user",
          content:
            `【参考资料】\n${context || "（未检索到相关资料）"}\n\n【当前问题】\n${opts.question}`,
        },
      ];

      this.logger.debug(
        `ask: hits=${topHits.length}, history=${chatHistory.length}, hasRelevant=${hasRelevantResults}`,
      );

      // 4. 创建/更新会话
      let finalConvId = conversationId;
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
          conversationId: finalConvId,
          role: "user",
          content: opts.question,
        },
      });

      await this.prisma.qAConversation.update({
        where: { id: finalConvId },
        data: { updatedAt: new Date() },
      });

      // 5. 流式 LLM
      let full = "";
      await this.llm.streamChat(messages, {
        onChunk: (delta) => {
          full += delta;
          opts.onChunk(delta);
        },
        onError: (e) => {
          this.logger.error(`LLM stream error: ${e.message}`);
          opts.onError(e);
        },
      });

      // 6. 落库（此时才发送 citations，确保前端在 LLM 完成前不渲染参考资料）
      const messageId = uuid();
      await this.prisma.qAMessage.create({
        data: {
          id: messageId,
          conversationId: finalConvId,
          role: "assistant",
          content: full,
          citations: citations as any,
        },
      });

      // 7. LLM 完成后才发送 citations，前端此时才渲染参考资料区域
      opts.onCitations(citations);
      opts.onDone(messageId, finalConvId);
    } catch (e: any) {
      this.logger.error(`ask error: ${e.message}`, e.stack);
      opts.onError(e);
    }
  }
}
