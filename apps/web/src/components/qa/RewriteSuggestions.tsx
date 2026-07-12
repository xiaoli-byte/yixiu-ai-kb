"use client";
// no_results 事件返回的改写建议列表
export interface RewriteSuggestionsProps {
  suggestions: string[];
  disabled: boolean;
  onPick: (suggestion: string) => void;
}

export function RewriteSuggestions({ suggestions, disabled, onPick }: RewriteSuggestionsProps) {
  if (suggestions.length === 0) return null;
  return (
    <div className="max-w-2xl mx-auto rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <div className="text-xs font-medium text-amber-800">Suggested rewrites</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs text-amber-900 transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
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
