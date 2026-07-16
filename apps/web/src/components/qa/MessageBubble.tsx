"use client";
// 单条消息：AI 回答通栏纯文本（无框无线），用户消息浅灰气泡；
// AI 色只做点状信号（标识图标、思考脉冲）；引用文档用彩色文件图标卡片（与检索结果页同一套语义色）
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink, Sparkles } from "lucide-react";
import { FeedbackControls } from "./FeedbackControls";
import { getFileBadge } from "@/lib/file-preview";
import type { ChatMessage, MessageFeedback, MessageFeedbackRating } from "./types";

export interface MessageBubbleProps {
  msg: ChatMessage;
  streaming?: boolean;
  onCitationClick: (
    documentId: string,
    documentTitle: string,
    mime: string,
    page?: number,
    canDownload?: boolean,
  ) => void;
  onFeedback?: (
    messageId: string,
    rating: MessageFeedbackRating,
    feedbackText?: string | null,
  ) => Promise<MessageFeedback>;
}

// AI 思考中的三点脉冲（面积极小的 AI 色信号，表达"AI 工作中"）
function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1 py-1" role="status" aria-label="AI 正在思考">
      <span className="h-1.5 w-1.5 rounded-full bg-ai animate-bounce" />
      <span className="h-1.5 w-1.5 rounded-full bg-ai animate-bounce [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-ai animate-bounce [animation-delay:300ms]" />
    </span>
  );
}

export function MessageBubble({ msg, streaming, onCitationClick, onFeedback }: MessageBubbleProps) {
  const isUser = msg.role === "user";

  // 用户消息：右对齐浅灰气泡
  if (isUser) {
    return (
      <div className="mx-auto flex w-full max-w-3xl justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-surface-muted px-4 py-3 text-sm leading-relaxed text-slate-800">
          <p className="whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
    );
  }

  // AI 回答：通栏纯文本排版，与用户气泡靠布局区分，不靠颜色
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex items-center gap-1.5 pb-1.5 text-xs font-medium text-slate-400">
        <Sparkles size={12} className="text-ai/80" />
        AI 回答
      </div>
      <div className="text-sm leading-relaxed">
        <div
          className="prose prose-sm prose-slate max-w-none
            prose-p:my-1 prose-p:leading-relaxed
            prose-headings:text-slate-800 prose-headings:font-semibold
            prose-h2:text-lg prose-h3:text-base
            prose-ul:text-sm prose-ol:text-sm
            prose-li:my-0.5
            prose-code:text-slate-800 prose-code:bg-slate-100 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
            prose-pre:bg-slate-800 prose-pre:text-slate-100
          "
        >
          {msg.content ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          ) : streaming ? (
            <TypingIndicator />
          ) : (
            <p>（无内容）</p>
          )}
          {streaming && msg.content && (
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-slate-400 align-middle" />
          )}
          {!streaming && msg.stopped && (
            <p className="mt-1 text-xs text-slate-500">（已停止生成）</p>
          )}
        </div>

        {/* 引用文档：彩色文件图标卡片（对齐设计稿），置于回答下方的分隔线之后 */}
        {msg.citations?.length > 0 && (
          <div className="mt-3 border-t border-slate-200/70 pt-3">
            <div className="mb-2 text-xs font-medium text-slate-500">引用文档（{msg.citations.length}）</div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {msg.citations.map((c) => {
                const badge = getFileBadge(c.mime || "", c.documentTitle);
                return (
                  <button
                    key={c.index}
                    onClick={() => onCitationClick(c.documentId, c.documentTitle, c.mime || "", c.page ?? undefined, c.canDownload !== false)}
                    className="group flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5 text-left transition hover:border-brand-300 hover:shadow-card"
                    title={c.snippet}
                  >
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white ${badge.tone}`}>
                      {badge.text}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-slate-700 group-hover:text-brand-700">
                        {c.documentTitle}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                        引用 {c.index}
                        {c.page != null && ` · 第${c.page}页`}
                      </span>
                    </span>
                    <ExternalLink size={11} className="shrink-0 text-slate-300 group-hover:text-brand-500" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!streaming && onFeedback && (
          <FeedbackControls messageId={msg.id} feedback={msg.feedback} onSubmit={onFeedback} />
        )}
      </div>
    </div>
  );
}

export default MessageBubble;
