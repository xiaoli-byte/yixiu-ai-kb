import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PRISMA, DatabaseService } from "../../database/database.service";
import { LlmService, ChatMessage } from "../llm/llm.service";

export interface ConversationMemory {
  /** 覆盖较早消息的滚动摘要，无摘要时为空串 */
  summary: string;
  /** 最近若干轮完整对话（user/assistant 交替，时间升序） */
  recentMessages: ChatMessage[];
  /** 会话当前总消息数（含本轮之前的全部） */
  totalMessages: number;
}

interface MessageRow {
  role: string;
  content: string;
}

/**
 * 长会话记忆：滚动摘要 + 最近 K 轮全文。
 * - 最近 RECENT_MESSAGE_LIMIT 条消息原文进入上下文（单条截断到 MAX_MESSAGE_CHARS）
 * - 更早的内容压缩进 qa_conversations.summary，由 LLM 增量维护
 */
@Injectable()
export class ConversationMemoryService {
  private readonly logger = new Logger(ConversationMemoryService.name);

  /** 进入 prompt 的最近消息条数（user+assistant 合计，约 5 轮） */
  private readonly RECENT_MESSAGE_LIMIT = 10;
  /** 单条历史消息进入 prompt 的最大字符数 */
  private readonly MAX_MESSAGE_CHARS = 1600;
  /**
   * 未摘要消息超过该阈值时触发一次摘要更新。
   * 取 3 而非更大值以缩小「记忆盲区」：摘要覆盖点 = 总数 - RECENT_MESSAGE_LIMIT，
   * 而摘要滞后一轮异步生成，阈值越大，早期消息「已滑出最近原文窗口、又尚未进摘要」
   * 的窗口越宽（最坏 SUMMARY_TRIGGER-1 条）。取 3 把盲区压到最多 2 条（约 1 轮），
   * 代价是摘要 LLM 调用更频繁（约每 1.5 轮一次，异步执行不影响首字延迟）。
   */
  private readonly SUMMARY_TRIGGER = 3;
  /** 摘要文本的最大字符数 */
  private readonly MAX_SUMMARY_CHARS = 1200;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly db: DatabaseService,
    private readonly llm: LlmService,
  ) {}

  async load(conversationId?: string): Promise<ConversationMemory> {
    if (!conversationId) {
      return { summary: "", recentMessages: [], totalMessages: 0 };
    }

    const [conv, rows, totalRow] = await Promise.all([
      this.prisma.qAConversation.findUnique({
        where: { id: conversationId },
        select: { summary: true },
      }),
      this.db.query<MessageRow>(
        `SELECT role, content FROM (
           SELECT role, content, created_at, id
           FROM qa_messages
           WHERE conversation_id = $1
           ORDER BY created_at DESC, id DESC
           LIMIT $2
         ) recent
         ORDER BY created_at ASC, id ASC`,
        [conversationId, this.RECENT_MESSAGE_LIMIT],
      ),
      this.db.queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM qa_messages WHERE conversation_id = $1`,
        [conversationId],
      ),
    ]);

    const recentMessages = rows
      .filter((r) => r.role === "user" || r.role === "assistant")
      .map((r) => ({
        role: r.role as "user" | "assistant",
        content: this.truncate(r.content, this.MAX_MESSAGE_CHARS),
      }));

    return {
      summary: (conv?.summary || "").trim(),
      recentMessages,
      totalMessages: Number(totalRow?.count) || 0,
    };
  }

  /**
   * 回答完成后调用：若未摘要的历史消息积累到阈值，用 LLM 增量更新滚动摘要。
   * 摘要覆盖到「总消息数 - RECENT_MESSAGE_LIMIT」为止，保证最近几轮始终以原文形式存在。
   * 设计为 fire-and-forget，失败只记日志，不影响问答主流程。
   */
  async maybeUpdateSummary(conversationId: string): Promise<void> {
    try {
      const conv = await this.prisma.qAConversation.findUnique({
        where: { id: conversationId },
        select: { summary: true, summaryMessageCount: true },
      });
      if (!conv) return;

      const totalRow = await this.db.queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM qa_messages WHERE conversation_id = $1`,
        [conversationId],
      );
      const total = Number(totalRow?.count) || 0;
      const targetCovered = Math.max(0, total - this.RECENT_MESSAGE_LIMIT);
      if (targetCovered - conv.summaryMessageCount < this.SUMMARY_TRIGGER) return;

      // 取出「已摘要末尾 → 目标覆盖点」之间的消息作为增量素材
      // ORDER BY 补充 id 作为第二排序键，与 load() 的稳定排序保持一致，避免同毫秒消息分页错位
      const rows = await this.db.query<MessageRow>(
        `SELECT role, content
         FROM qa_messages
         WHERE conversation_id = $1
         ORDER BY created_at ASC, id ASC
         OFFSET $2 LIMIT $3`,
        [conversationId, conv.summaryMessageCount, targetCovered - conv.summaryMessageCount],
      );
      if (rows.length === 0) return;

      const delta = rows
        .map((r) => `${r.role === "user" ? "用户" : "助手"}：${this.truncate(r.content, 500)}`)
        .join("\n");

      const summary = await this.llm.chat(
        [
          {
            role: "system",
            content:
              "你是对话摘要器。把已有摘要与新增对话合并成一份简洁的中文摘要，保留：用户关注的主体（人名/公司/产品等）、已确认的关键事实与结论、用户的偏好和未解决的问题。不要逐轮复述，不要加入摘要以外的评论。300 字以内。",
          },
          {
            role: "user",
            content: `已有摘要：\n${conv.summary?.trim() || "（无）"}\n\n新增对话：\n${delta}\n\n请输出合并后的摘要。`,
          },
        ],
        { temperature: 0, maxTokens: 500 },
      );

      const normalized = this.truncate(summary.trim(), this.MAX_SUMMARY_CHARS);
      if (!normalized) return;

      // 乐观并发控制：where 带上读取时的 summaryMessageCount 旧值。
      // 若期间有并发的另一次更新已抢先写入（count 为 0），说明状态已变化，放弃本次写入，
      // 下一轮 maybeUpdateSummary 会基于最新 summaryMessageCount 自愈，不视为错误、不抛错。
      const { count } = await this.prisma.qAConversation.updateMany({
        where: { id: conversationId, summaryMessageCount: conv.summaryMessageCount },
        data: { summary: normalized, summaryMessageCount: targetCovered },
      });
      if (count === 0) {
        this.logger.debug(
          `会话 ${conversationId} 摘要更新被并发跳过（summaryMessageCount 已变化），本次放弃写入`,
        );
        return;
      }
      this.logger.debug(
        `会话 ${conversationId} 摘要已更新，覆盖前 ${targetCovered}/${total} 条消息`,
      );
    } catch (e: any) {
      this.logger.warn(`会话摘要更新失败（不影响问答）: ${e.message}`);
    }
  }

  private truncate(text: string, maxLength: number) {
    const compact = (text || "").replace(/\s+/g, " ").trim();
    return compact.length > maxLength ? `${compact.slice(0, maxLength)}…` : compact;
  }
}
