"use client";
// 封装 POST /qa/ask 的 SSE 流式请求解析逻辑，供 QA 页面调用。
// 协议：conversation / chunk / citations / no_results / done / error 六种事件。
import { useCallback, useRef, useState } from "react";
import { apiBaseUrl, ApiError } from "@/lib/api-client";
import { COOKIE_SESSION } from "@/lib/store";
import type { Citation } from "@/types/api";

export interface QaStreamDoneResult {
  status: "done";
  conversationId: string | null;
  messageId: string;
  content: string;
  citations: Citation[];
}

export interface QaStreamAbortedResult {
  status: "aborted";
  /** abort 时已知的会话 ID（来自 conversation/done 事件）；首问被停止也能拿到，避免下一问另开会话 */
  conversationId: string | null;
  content: string;
  citations: Citation[];
}

export interface QaStreamErrorResult {
  status: "error";
  message: string;
}

export type QaStreamResult =
  | QaStreamDoneResult
  | QaStreamAbortedResult
  | QaStreamErrorResult;

interface AskParams {
  conversationId: string | null;
  question: string;
  accessToken: string | null;
}

export function useQaStream() {
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingCitations, setStreamingCitations] = useState<Citation[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const resetSuggestions = useCallback(() => setSuggestions([]), []);

  // 中止当前正在进行的流式请求（用户点击“停止”）
  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const ask = useCallback(async ({ conversationId, question, accessToken }: AskParams): Promise<QaStreamResult> => {
    const controller = new AbortController();
    abortRef.current = controller;

    setStreaming(true);
    setStreamingText("");
    setStreamingCitations([]);
    setSuggestions([]);

    let assembled = "";
    let citations: Citation[] = [];
    // 会话 ID 提升到 try 外层：conversation / done 事件都会写它，abort 时 catch 分支也能读到，
    // 从而把服务端已创建的会话归属回本次请求（修复首问被停止后丢失 conversationId 的缺陷）。
    let convId: string | null = conversationId;

    try {
      // 鉴权方式与 apiClient 保持一致：
      // - 联合登录（cookie 会话）时 accessToken 是 COOKIE_SESSION 哨兵值，不能当 Bearer 用，
      //   靠 credentials: "include" 带上 ai-call 的共享 cookie 认证
      // - 本地 Bearer 登录时正常附加 Authorization
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken && accessToken !== COOKIE_SESSION) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
      const res = await fetch(`${apiBaseUrl}/qa/ask`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ conversationId, question }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new ApiError(res.status, "REQUEST_FAILED", `请求失败: ${res.status}`);
      }

      const reader = (res.body as any).getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let messageId = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (!payload) continue;

          let evt: any;
          try {
            evt = JSON.parse(payload);
          } catch (e) {
            // 该 data 行已按换行完整切分（未收完的行留在 buf 里等下一次 read），不存在“半截等拼接”的情况；
            // 走到这里即为罕见的异常/损坏事件，如实丢弃并记录，不再对特定错误文案做特殊判断。
            console.error("SSE 事件解析失败，已丢弃该行", e, payload);
            continue;
          }

          if (evt.type === "conversation") {
            // 会话创建后立即到达（早于 LLM 生成）。记录会话 ID，
            // 即便随后被 abort 也能把服务端已建好的会话归属到本次请求，避免下一问另开新会话。
            if (evt.conversationId) convId = evt.conversationId;
          } else if (evt.type === "chunk") {
            assembled += evt.content;
            setStreamingText(assembled);
          } else if (evt.type === "citations") {
            citations = evt.citations || [];
            setStreamingCitations(citations);
          } else if (evt.type === "done") {
            convId = evt.conversationId;
            messageId = evt.messageId;
          } else if (evt.type === "error") {
            // 显式抛出，交由外层 catch 统一转成失败结果（不要静默吞掉）
            throw new Error(evt.message || "AI 回答生成失败");
          } else if (evt.type === "no_results") {
            setSuggestions(Array.isArray(evt.suggestions) ? evt.suggestions.filter(Boolean) : []);
          }
        }
      }

      return { status: "done", conversationId: convId, messageId, content: assembled, citations };
    } catch (e: any) {
      if (e?.name === "AbortError") {
        return { status: "aborted", conversationId: convId, content: assembled, citations };
      }
      return { status: "error", message: e?.message || "发生错误，请重试" };
    } finally {
      abortRef.current = null;
      setStreaming(false);
      setStreamingText("");
      setStreamingCitations([]);
    }
  }, []);

  return {
    streaming,
    streamingText,
    streamingCitations,
    suggestions,
    ask,
    stop,
    resetSuggestions,
  };
}
