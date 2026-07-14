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

/** 单次 chat（查询改写 / 摘要等）的总超时 */
const CHAT_TIMEOUT_MS = 30_000;
/** 流式生成的兜底总超时（叠加在客户端断开信号之上） */
const STREAM_TIMEOUT_MS = 120_000;

/**
 * 流式生成被中止时抛出，携带中止原因与已生成的 partial 文本，供上层区分处理：
 * - client_aborted：客户端断开连接，上层可把 partial 落库（"已停止"）
 * - timeout：超过总超时，按普通错误处理
 */
export class StreamAbortedError extends Error {
  constructor(
    public readonly reason: "client_aborted" | "timeout",
    public readonly partial: string,
  ) {
    super(reason === "timeout" ? "LLM 流式生成超时" : "客户端已断开连接");
    this.name = "StreamAbortedError";
  }
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
    // 默认 30s 超时，避免 planner/摘要等阻塞挂死
    const res = await model.invoke(lcMessages, {
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });
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
    opts: ChatOptions & { signal?: AbortSignal } = {},
  ): Promise<string> {
    const { signal: clientSignal, ...chatOpts } = opts;
    // 合并「客户端断开」与「总超时」两个信号：任一触发即中止生成（Node 20+）
    const timeoutSignal = AbortSignal.timeout(STREAM_TIMEOUT_MS);
    const combinedSignal = clientSignal
      ? AbortSignal.any([clientSignal, timeoutSignal])
      : timeoutSignal;
    // 中止时区分原因：客户端断开优先于超时
    const abortReason = (): "client_aborted" | "timeout" =>
      clientSignal?.aborted ? "client_aborted" : "timeout";

    if (this.mock) {
      const text = `(mock) 这是流式输出示例。LLM 已收到 ${messages.length} 条消息。`;
      let full = "";
      for (const ch of text) {
        if (combinedSignal.aborted) {
          throw new StreamAbortedError(abortReason(), full);
        }
        full += ch;
        cb.onChunk(ch);
        await new Promise((r) => setTimeout(r, 8));
      }
      cb.onDone?.(full);
      return full;
    }

    let full = "";
    try {
      const lcMessages = toLangChainMessages(messages);
      const model = this.getChatModel(chatOpts);
      const stream = await model.stream(lcMessages, { signal: combinedSignal });

      for await (const chunk of stream) {
        const c = chunk as any;
        const text = (c.content || c.kwargs?.content || "") as string;
        if (text) {
          full += text;
          cb.onChunk(text);
        }
      }
    } catch (e: any) {
      // 中止（客户端断开 / 超时）：携带 partial 抛出可识别错误，交由上层落库或上报
      if (combinedSignal.aborted) {
        throw new StreamAbortedError(abortReason(), full);
      }
      cb.onError?.(e as Error);
      throw e;
    }

    // 兜底：部分实现被中止时不抛错而是静默结束，这里再判定一次
    if (combinedSignal.aborted) {
      throw new StreamAbortedError(abortReason(), full);
    }
    cb.onDone?.(full);
    return full;
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
