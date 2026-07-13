"use client";
// 单条消息：AI 回答通栏纯文本（无框无线），用户消息浅灰气泡；
// AI 色只做点状信号（标识图标、思考脉冲），辅助内容（引用/光标/徽标）灰化不抢眼
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, ExternalLink, Quote, Sparkles } from "lucide-react";
import { FeedbackControls } from "./FeedbackControls";
import type { ChatMessage, MessageFeedback, MessageFeedbackRating } from "./types";

function isMarkdownDoc(mime: string, title: string): boolean {
  return mime.includes("markdown") || mime === "text/markdown" || title.toLowerCase().endsWith(".md");
}

export interface MessageBubbleProps {
  msg: ChatMessage;
  streaming?: boolean;
  onCitationClick: (documentId: string, documentTitle: string, mime: string, page?: number) => void;
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

        {/* 参考资料：辅助内容灰阶呈现，hover 时才泛出 AI 色反馈 */}
        {msg.citations?.length > 0 && (
          <div className="mt-3 border-t border-slate-200/70 pt-3">
            <div className="mb-2 flex items-center gap-1.5">
              <Quote size={12} className="text-slate-400" />
              <span className="text-xs font-medium text-slate-500">参考资料</span>
            </div>
            <div className="space-y-2">
              {msg.citations.map((c) => (
                <button
                  key={c.index}
                  onClick={() => onCitationClick(c.documentId, c.documentTitle, c.mime || "", c.page ?? undefined)}
                  className="group flex w-full cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-2 text-left transition hover:border-ai/30 hover:bg-ai-surface/60"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-200/80 text-[10px] font-bold text-slate-600 group-hover:bg-ai/10 group-hover:text-ai">
                    {c.index}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 truncate text-xs font-medium text-slate-700">
                      {isMarkdownDoc(c.mime || "", c.documentTitle) ? (
                        <span className="shrink-0 font-medium text-slate-500">MD</span>
                      ) : (
                        <BookOpen size={10} className="shrink-0 text-slate-500" />
                      )}
                      {c.documentTitle}
                      {c.page != null && (
                        <span className="ml-1 shrink-0 rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] text-slate-600">
                          第{c.page}页
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
                      {c.snippet}
                    </div>
                  </div>
                  <ExternalLink size={10} className="mt-1 shrink-0 text-slate-400 group-hover:text-ai" />
                </button>
              ))}
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
