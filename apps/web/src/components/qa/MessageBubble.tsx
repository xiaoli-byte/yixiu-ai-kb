"use client";
// 单条消息气泡：Markdown 渲染 + 引用列表 + 反馈控件
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, ExternalLink, Quote } from "lucide-react";
import { cn } from "@/lib/utils";
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

export function MessageBubble({ msg, streaming, onCitationClick, onFeedback }: MessageBubbleProps) {
  const isUser = msg.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3 shadow-soft",
          isUser
            ? "bg-brand-600 text-white rounded-br-md"
            : "bg-white border border-slate-200 text-slate-800 rounded-bl-md",
        )}
      >
        {/* 消息内容 */}
        <div className="leading-relaxed text-sm">
          {isUser ? (
            <p className="whitespace-pre-wrap">{msg.content}</p>
          ) : (
            <div
              className="prose prose-sm prose-slate max-w-none
                prose-p:my-1 prose-p:leading-relaxed
                prose-headings:text-slate-800 prose-headings:font-semibold
                prose-h2:text-lg prose-h3:text-base
                prose-ul:text-sm prose-ol:text-sm
                prose-li:my-0.5
                prose-code:text-brand-600 prose-code:bg-slate-100 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-slate-800 prose-pre:text-slate-100
              "
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {msg.content || (streaming ? "思考中..." : "（无内容）")}
              </ReactMarkdown>
              {streaming && (
                <span className="inline-block w-1.5 h-4 bg-brand-400 ml-0.5 animate-pulse align-middle" />
              )}
              {!streaming && msg.stopped && (
                <p className="mt-1 text-xs text-slate-400">（已停止生成）</p>
              )}
            </div>
          )}
        </div>

        {/* 参考资料 */}
        {!isUser && msg.citations?.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-1.5 mb-2">
              <Quote size={12} className="text-brand-400" />
              <span className="text-xs font-medium text-slate-500">参考资料</span>
            </div>
            <div className="space-y-2">
              {msg.citations.map((c) => (
                <button
                  key={c.index}
                  onClick={() => onCitationClick(c.documentId, c.documentTitle, c.mime || "", c.page ?? undefined)}
                  className="w-full text-left flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 hover:bg-brand-50 border border-transparent hover:border-brand-200 transition group cursor-pointer"
                >
                  <span
                    className={cn(
                      "shrink-0 w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center mt-0.5",
                      isUser ? "bg-white/20 text-white" : "bg-brand-100 text-brand-700 group-hover:bg-brand-200",
                    )}
                  >
                    {c.index}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-slate-700 truncate flex items-center gap-1">
                      {isMarkdownDoc(c.mime || "", c.documentTitle) ? (
                        <span className="shrink-0 text-blue-500 font-medium">MD</span>
                      ) : (
                        <BookOpen size={10} className="text-slate-400 shrink-0" />
                      )}
                      {c.documentTitle}
                      {c.page != null && (
                        <span className="ml-1 text-[10px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full shrink-0">
                          第{c.page}页
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                      {c.snippet}
                    </div>
                  </div>
                  <ExternalLink size={10} className="text-slate-400 group-hover:text-brand-500 mt-1 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {!isUser && !streaming && onFeedback && (
          <FeedbackControls messageId={msg.id} feedback={msg.feedback} onSubmit={onFeedback} />
        )}
      </div>
    </div>
  );
}

export default MessageBubble;
