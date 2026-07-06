import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ChatAlibabaTongyi } from "@langchain/community/chat_models/alibaba_tongyi";
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AppConfigService } from "../../config/app-config.service";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

export interface StreamCallbacks {
  onChunk: (content: string) => void;
  onDone: (fullText: string) => void;
  onError: (e: Error) => void;
}

function toLangChainMessages(messages: ChatMessage[]): BaseMessage[] {
  return messages.map((m) => {
    if (m.role === "system") return new SystemMessage(m.content);
    if (m.role === "user") return new HumanMessage(m.content);
    return new AIMessage(m.content);
  });
}

@Injectable()
export class LlmService implements OnModuleInit {
  private readonly logger = new Logger(LlmService.name);
  private apiKey = "";
  private model = "";
  private mock = false;
  private chatModel!: ChatAlibabaTongyi;

  constructor(private readonly config: AppConfigService) {}

  onModuleInit() {
    const dashscope = this.config.dashscope;
    this.apiKey = dashscope.apiKey;
    this.model = dashscope.llmModel;
    this.mock = dashscope.llmMock || this.apiKey.startsWith("sk-replace");

    if (this.mock) {
      this.logger.warn("LLM mock 模式");
    } else {
      this.chatModel = this.createChatModel();
      this.logger.log(`LLM 就绪: ${this.model}`);
    }
  }

  get isMock() {
    return this.mock;
  }

  /** 单次 chat */
  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    if (this.mock) {
      return `(mock) 我是基于 Qwen 的助手。基于您提供的 ${messages.length} 条消息，给出一个示例回答。`;
    }
    const lcMessages = toLangChainMessages(messages);
    const model = this.getChatModel(opts);
    const res = await model.invoke(lcMessages);
    return res.content as string;
  }

  /**
   * Streaming chat — 使用 LangChain stream() 实现。
   *
   * LangChain ChatAlibabaTongyi 内部处理：
   * - DashScope SSE header (X-DashScope-SSE)
   * - 增量输出 (incremental_output: true)
   * - SSE 行解析
   *
   * stream() 每次 yield 一个字符串 chunk（增量片段），直接转发给前端。
   */
  async streamChat(
    messages: ChatMessage[],
    cb: { onChunk: (delta: string) => void; onDone?: (full: string) => void; onError?: (e: Error) => void },
    opts: ChatOptions = {},
  ): Promise<string> {
    if (this.mock) {
      const text = `(mock) 这是流式输出示例。LLM 已收到 ${messages.length} 条消息。`;
      for (const ch of text) {
        cb.onChunk(ch);
        await new Promise((r) => setTimeout(r, 8));
      }
      cb.onDone?.(text);
      return text;
    }

    try {
      const lcMessages = toLangChainMessages(messages);
      const model = this.getChatModel(opts);
      const stream = await model.stream(lcMessages);
      let full = "";

      for await (const chunk of stream) {
        const c = (chunk as any);
        const text = (c.content || c.kwargs?.content || "") as string;
        if (text) {
          full += text;
          cb.onChunk(text);
        }
      }

      cb.onDone?.(full);
      return full;
    } catch (e: any) {
      cb.onError?.(e as Error);
      throw e;
    }
  }

  private createChatModel(opts: ChatOptions = {}) {
    return new ChatAlibabaTongyi({
      model: this.model,
      alibabaApiKey: this.apiKey,
      temperature: opts.temperature ?? 0.3,
      topP: opts.topP ?? 0.8,
      maxTokens: opts.maxTokens ?? 2048,
    });
  }

  private getChatModel(opts: ChatOptions = {}) {
    if (
      opts.temperature === undefined &&
      opts.topP === undefined &&
      opts.maxTokens === undefined
    ) {
      return this.chatModel;
    }
    return this.createChatModel(opts);
  }
}
