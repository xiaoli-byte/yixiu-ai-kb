import { X } from "lucide-react";

export interface SelectedSearchFilter {
  key: string;
  label: string;
  value: string;
}

interface SearchSelectedFiltersProps {
  items: SelectedSearchFilter[];
  onRemove: (key: string) => void;
  onClear?: () => void;
}

/** 已选条件 chips（内嵌形态，由结果工具栏承载，不再独占一行） */
export function SearchSelectedFilters({ items, onRemove, onClear }: SearchSelectedFiltersProps) {
  if (items.length === 0) return null;

  return (
    <span aria-label="已选搜索条件" className="inline-flex flex-wrap items-center gap-1.5">
      {items.map((item) => (
        <span key={item.key} className="inline-flex max-w-full items-center gap-1 rounded-full border border-brand-100 bg-white px-2.5 py-1 text-xs text-slate-700">
          <span className="text-slate-500">{item.label}：</span>
          <span className="max-w-40 truncate">{item.value}</span>
          <button aria-label={`移除${item.label}条件`} className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" onClick={() => onRemove(item.key)} type="button">
            <X size={12} />
          </button>
        </span>
      ))}
      {onClear && <button className="text-xs text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" onClick={onClear} type="button">清除全部</button>}
    </span>
  );
}
