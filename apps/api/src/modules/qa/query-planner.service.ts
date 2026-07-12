import { Injectable, Logger } from "@nestjs/common";
import { LlmService, ChatMessage } from "../llm/llm.service";
import type { ConversationMemory } from "./conversation-memory.service";

export interface QueryPlan {
  /** 用于检索的独立问题（无历史时等于原问题） */
  retrievalQuery: string;
  /** 是否结合了会话上下文改写 */
  usedContext: boolean;
}

/**
 * 检索查询规划：有会话历史时，每轮都用 LLM 把当前问题改写成可独立检索的问题
 * （补全代词、省略的主体和限定条件），LLM 失败时降级为启发式拼接。
 */
@Injectable()
export class QueryPlannerService {
  private readonly logger = new Logger(QueryPlannerService.name);
  private readonly MAX_QUERY_CHARS = 300;

  constructor(private readonly llm: LlmService) {}

  async plan(question: string, memory: ConversationMemory): Promise<QueryPlan> {
    const normalized = this.compact(question, this.MAX_QUERY_CHARS);
    if (memory.recentMessages.length === 0 && !memory.summary) {
      return { retrievalQuery: normalized, usedContext: false };
    }

    const fallback = this.heuristicQuery(normalized, memory);
    if (this.llm.isMock) {
      return { retrievalQuery: fallback, usedContext: true };
    }

    try {
      const rewritten = await this.llm.chat(
        [
          {
            role: "system",
            content:
              "你是知识库检索查询改写器。根据对话背景，把当前问题改写成一个不依赖上下文即可检索的独立中文问题：补全代词指代、省略的主体、对象和限定条件。若当前问题本身已经独立完整，原样输出。不要回答问题，不要新增对话中没有的事实。只输出改写后的一行问题。",
          },
          {
            role: "user",
            content: this.buildRewriteInput(normalized, memory),
          },
        ],
        { temperature: 0, topP: 0.2, maxTokens: 150 },
      );
      const cleaned = this.cleanRewritten(rewritten);
      if (cleaned) {
        return { retrievalQuery: cleaned, usedContext: cleaned !== normalized };
      }
    } catch (e: any) {
      this.logger.warn(`检索查询改写失败，使用启发式拼接: ${e.message}`);
    }

    return { retrievalQuery: fallback, usedContext: true };
  }

  private buildRewriteInput(question: string, memory: ConversationMemory) {
    const parts: string[] = [];
    if (memory.summary) {
      parts.push(`对话背景摘要：\n${memory.summary}`);
    }
    if (memory.recentMessages.length > 0) {
      const lines = memory.recentMessages
        .slice(-6)
        .map((m) => `${m.role === "user" ? "用户" : "助手"}：${this.compact(m.content, 240)}`);
      parts.push(`最近对话：\n${lines.join("\n")}`);
    }
    parts.push(`当前问题：${question}`);
    return parts.join("\n\n");
  }

  private heuristicQuery(question: string, memory: ConversationMemory) {
    const recentUser = [...memory.recentMessages]
      .reverse()
      .find((m) => m.role === "user")?.content;
    const parts = [
      recentUser ? this.compact(recentUser, 120) : "",
      question,
    ].filter(Boolean);
    return this.compact(parts.join(" "), this.MAX_QUERY_CHARS + 120);
  }

  private cleanRewritten(raw: string) {
    const firstLine = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (!firstLine) return "";
    const withoutLabel = firstLine
      .replace(/^[-*\d.、\s]+/, "")
      .replace(/^(独立问题|检索问题|改写后问题|改写|问题)[:：]\s*/, "")
      .replace(/^["'`“”]+|["'`“”]+$/g, "");
    return this.compact(withoutLabel, this.MAX_QUERY_CHARS);
  }

  private compact(text: string, maxLength: number) {
    const compact = (text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return compact.length > maxLength ? compact.slice(0, maxLength) : compact;
  }
}
