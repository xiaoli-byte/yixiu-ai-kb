"use client";
// 底部输入区：悬浮卡片式输入框（无分隔线，与消息区连为一体）
// textarea 通栏在上，操作行在下；自动增高
import { useEffect, type RefObject } from "react";
import { Send, Square } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  textareaRef: RefObject<HTMLTextAreaElement>;
}

const MAX_HEIGHT = 192; // 与 max-h-48 保持一致

export function ChatInput({ value, onChange, onSend, onStop, streaming, textareaRef }: ChatInputProps) {
  // 自动调整 textarea 高度（min-height 由 CSS 兜底）
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, MAX_HEIGHT) + "px";
    }
  }, [value, textareaRef]);

  return (
    <div className="sticky bottom-0 shrink-0">
      {/* 顶部渐变遮罩：消息滚动经过输入框时自然淡出，替代分隔线 */}
      <div className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-white to-transparent" />
      <div className="bg-white px-4 pb-4 pt-1">
        <div className="max-w-3xl mx-auto">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-card focus-within:border-ai/40 focus-within:ring-2 focus-within:ring-ai/10 focus-within:shadow-raised transition">
          <textarea
            ref={textareaRef}
            className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-sm leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 min-h-[64px] max-h-48"
            placeholder="输入你的问题…"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!streaming) onSend();
              }
            }}
          />
          <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
            <span className="text-xs text-slate-400">Enter 发送 · Shift+Enter 换行</span>
            {streaming ? (
              <button
                className="flex shrink-0 items-center gap-1 rounded-xl bg-slate-700 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-slate-800"
                onClick={onStop}
                title="停止生成"
              >
                <Square size={12} />
                停止
              </button>
            ) : (
              <button
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-xl px-3.5 py-2 text-xs font-medium transition",
                  value.trim()
                    ? "bg-ai text-white hover:bg-ai/90"
                    : "bg-slate-200 text-slate-500 cursor-not-allowed",
                )}
                disabled={!value.trim()}
                onClick={onSend}
              >
                <Send size={12} />
                发送
              </button>
            )}
          </div>
        </div>
          <p className="text-xs text-slate-400 mt-2 text-center">
            AI 回答仅供参考，请结合原始文档核实重要信息
          </p>
        </div>
      </div>
    </div>
  );
}

export default ChatInput;
