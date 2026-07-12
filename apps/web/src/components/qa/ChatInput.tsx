"use client";
// 底部输入区：自动增高的 textarea + 发送/停止按钮
import { useEffect, type RefObject } from "react";
import { Loader2, Send, Square } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  textareaRef: RefObject<HTMLTextAreaElement>;
}

export function ChatInput({ value, onChange, onSend, onStop, streaming, textareaRef }: ChatInputProps) {
  // 自动调整 textarea 高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [value, textareaRef]);

  return (
    <div className="border-t border-slate-200 bg-white p-4 shrink-0">
      <div className="max-w-3xl mx-auto">
        <div className="relative flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition">
          <textarea
            ref={textareaRef}
            className="flex-1 bg-transparent resize-none outline-none text-sm text-slate-800 placeholder:text-slate-400 max-h-40 py-1 leading-relaxed"
            placeholder="输入问题，按 Enter 发送，Shift+Enter 换行..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!streaming) onSend();
              }
            }}
          />
          {streaming ? (
            <button
              className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium transition flex items-center gap-1 bg-slate-700 text-white hover:bg-slate-800"
              onClick={onStop}
              title="停止生成"
            >
              <Square size={12} />
              停止
            </button>
          ) : (
            <button
              className={cn(
                "shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium transition flex items-center gap-1",
                value.trim()
                  ? "bg-brand-600 text-white hover:bg-brand-700"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed",
              )}
              disabled={!value.trim()}
              onClick={onSend}
            >
              <Send size={12} />
              发送
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-1.5 text-center">
          AI 回答仅供参考，请结合原始文档核实重要信息
        </p>
      </div>
    </div>
  );
}

export default ChatInput;
