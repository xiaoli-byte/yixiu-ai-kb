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
              className="inline-flex h-7 max-w-full items-center rounded border border-slate-200 bg-slate-50 text-xs text-slate-700"
            >
              <button
                className="max-w-[150px] truncate px-3"
                onClick={() => onSelect(item)}
                title={item.query}
                type="button"
              >
                {item.query}
              </button>
              <button
                className="grid h-7 w-7 place-items-center border-l border-slate-200 text-slate-400 hover:text-rose-600"
                onClick={() => onDelete(item.id)}
                title="删除历史"
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
