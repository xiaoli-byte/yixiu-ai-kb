import { Trash2, X } from "lucide-react";
import type { SearchHistoryItem } from "@/services/search";

interface SearchHistoryPanelProps {
  id?: string;
  items: SearchHistoryItem[];
  onSelect: (item: SearchHistoryItem) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

export function SearchHistoryPanel({ id, items, onSelect, onDelete, onClear }: SearchHistoryPanelProps) {
  return (
    <section className="scroll-mt-4" id={id}>
      <div className="flex items-center border-b border-slate-200 pb-3">
        <h2 className="flex-1 text-sm font-medium text-slate-900">搜索历史</h2>
        {items.length > 0 && (
          <button
            className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs text-slate-500 hover:bg-slate-50 hover:text-rose-600"
            onClick={onClear}
            type="button"
          >
            <Trash2 size={12} />
            清空
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 pt-4">
        {items.length === 0 ? (
          <div className="text-sm text-slate-500">暂无搜索历史</div>
        ) : (
          items.map((item) => (
            <span
              key={item.id}
              className="inline-flex h-7 max-w-full items-center overflow-hidden rounded border border-slate-200 bg-slate-50 text-xs text-slate-700"
            >
              <button
                aria-label={`使用搜索历史：${item.query}`}
                className="h-full max-w-[150px] truncate px-3 text-left leading-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                onClick={() => onSelect(item)}
                title={item.query}
                type="button"
              >
                {item.query}
              </button>
              <button
                onClick={() => onDelete(item.id)}
                aria-label={`删除搜索历史：${item.query}`}
                title="删除历史"
                className="grid h-full w-7 shrink-0 place-items-center border-l border-slate-200 text-slate-400 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                type="button"
              >
                <X size={12} />
              </button>
            </span>
          ))
        )}
      </div>
    </section>
  );
}
