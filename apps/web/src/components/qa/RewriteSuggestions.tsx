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
    <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <Sparkles size={12} className="text-ai/80" />
        试试这样问：
      </span>
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          onClick={() => onPick(suggestion)}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

export default RewriteSuggestions;
