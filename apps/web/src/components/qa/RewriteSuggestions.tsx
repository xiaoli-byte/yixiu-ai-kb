"use client";
// no_results 事件返回的改写建议列表（AI 生成内容，走 AI 紫语义色）
import { Sparkles } from "lucide-react";

export interface RewriteSuggestionsProps {
  suggestions: string[];
  disabled: boolean;
  onPick: (suggestion: string) => void;
}

export function RewriteSuggestions({ suggestions, disabled, onPick }: RewriteSuggestionsProps) {
  if (suggestions.length === 0) return null;
  return (
    <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <Sparkles size={12} className="text-ai/80" />
        试试这样问
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:border-ai/40 hover:bg-ai-surface/60 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled}
            onClick={() => onPick(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

export default RewriteSuggestions;
