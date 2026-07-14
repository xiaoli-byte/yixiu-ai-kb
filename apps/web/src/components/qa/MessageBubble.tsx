"use client";
// 单条消息（对齐设计稿）：AI 回答为带边框白卡 + 机器人头像；用户消息为右对齐浅色气泡 + 头像；
// 引用文档以彩色文件图标卡片呈现；时间戳展示在消息下方
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, ExternalLink, User } from "lucide-react";
import { FeedbackControls } from "./FeedbackControls";
import type { ChatMessage, MessageFeedback, MessageFeedbackRating } from "./types";

function isMarkdownDoc(mime: string, title: string): boolean {
  return mime.includes("markdown") || mime === "text/markdown" || title.toLowerCase().endsWith(".md");
}

/** 引用文档图标：按文件类型着色（与检索结果页徽标同一套语义色） */
function citationBadge(mime: string, title: string): { text: string; tone: string } {
  const raw = `${mime} ${title.split(".").pop() || ""}`.toLowerCase();
  if (raw.includes("pdf")) return { text: "PDF", tone: "bg-rose-500" };
  if (raw.includes("word") || raw.includes("doc")) return { text: "W", tone: "bg-blue-500" };
  if (raw.includes("sheet") || raw.includes("excel") || raw.includes("xls")) return { text: "X", tone: "bg-emerald-500" };
  if (raw.includes("presentation") || raw.includes("ppt")) return { text: "P", tone: "bg-amber-500" };
  if (isMarkdownDoc(mime, title)) return { text: "MD", tone: "bg-slate-500" };
  if (raw.includes("text") || raw.includes("txt")) return { text: "TXT", tone: "bg-sky-500" };
  return { text: "DOC", tone: "bg-slate-400" };
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
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
  const time = formatTime(msg.createdAt);

  // 用户消息：右对齐浅色气泡 + 头像
  if (isUser) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-start justify-end gap-2.5">
          <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-brand-50 px-4 py-3 text-sm leading-relaxed text-slate-800">
            <p className="whitespace-pre-wrap">{msg.content}</p>
          </div>
          <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-200 text-slate-500">
            <User size={15} />
          </span>
        </div>
        {time && <p className="mt-1 pr-[42px] text-right text-[11px] text-slate-400 tabular">{time}</p>}
      </div>
    );
  }

  // AI 回答：机器人头像 + 带边框白卡（对齐设计稿）
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ai text-white">
          <Bot size={16} />
        </span>
        <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3.5 text-sm leading-relaxed shadow-card">
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

          {/* 引用文档：彩色文件图标卡片（对齐设计稿） */}
          {msg.citations?.length > 0 && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="mb-2 text-xs font-medium text-slate-600">引用文档（{msg.citations.length}）</div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {msg.citations.map((c) => {
                  const badge = citationBadge(c.mime || "", c.documentTitle);
                  return (
                    <button
                      key={c.index}
                      onClick={() => onCitationClick(c.documentId, c.documentTitle, c.mime || "", c.page ?? undefined)}
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
      {time && <p className="mt-1 pl-[42px] text-[11px] text-slate-400 tabular">{time}</p>}
    </div>
  );
}

export default MessageBubble;
