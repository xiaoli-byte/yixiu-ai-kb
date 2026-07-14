import { AlertCircle, Grid2X2, List, SlidersHorizontal } from "lucide-react";
import type { SearchSortBy } from "@/services/search";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/Select";
import { SearchSelectedFilters, type SelectedSearchFilter } from "./SearchSelectedFilters";

interface SearchResultsToolbarProps {
  total: number; took?: number; sort: SearchSortBy; viewMode: "list" | "grid"; permissionNotice?: boolean; page?: number; pageSize?: number; truncated?: boolean; resultLimit?: number;
  selectedFilters?: SelectedSearchFilter[];
  onSortChange: (sort: SearchSortBy) => void; onViewModeChange: (mode: "list" | "grid") => void;
  onRemoveFilter?: (key: string) => void; onClearFilters?: () => void;
}
const SORT_OPTIONS: Array<{ value: SearchSortBy; label: string }> = [
  { value: "relevance", label: "相关度排序" }, { value: "time", label: "时间排序" }, { value: "name", label: "名称排序" },
];

export function SearchResultsToolbar({ total, took, sort, viewMode, permissionNotice = false, page = 1, pageSize = 10, truncated = false, resultLimit, selectedFilters = [], onSortChange, onViewModeChange, onRemoveFilter, onClearFilters }: SearchResultsToolbarProps) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-8">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2"><span className="text-sm text-slate-700">{truncated ? `当前展示 ${total.toLocaleString("zh-CN")} 条结果` : `找到约 ${total.toLocaleString("zh-CN")} 条结果`}{typeof took === "number" && <span className="text-slate-500">（用时 {(took / 1000).toFixed(2)} 秒）</span>}</span>{truncated && <span className="text-xs text-amber-700">候选结果已截断{resultLimit ? `（上限 ${resultLimit.toLocaleString("zh-CN")} 条）` : ""}</span>}<span className="text-xs text-slate-500">显示 {start}–{end}</span>{onRemoveFilter && <SearchSelectedFilters items={selectedFilters} onRemove={onRemoveFilter} onClear={onClearFilters} />}{permissionNotice && <span className="inline-flex min-h-7 items-center gap-1 rounded-md bg-amber-50 px-2 text-xs text-amber-800"><AlertCircle size={13} />部分文档可预览，但不可下载</span>}</div>
    <div className="flex items-center gap-2"><Select ariaLabel="排序方式" size="md" leadingIcon={<SlidersHorizontal size={13} />} value={sort} options={SORT_OPTIONS} onChange={(value) => onSortChange(value as SearchSortBy)} triggerWidthClassName="w-32" /><div aria-label="结果视图" className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5"><button aria-label="列表视图" aria-pressed={viewMode === "list"} className={cn("grid h-9 w-9 place-items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500", viewMode === "list" ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-slate-50")} onClick={() => onViewModeChange("list")} type="button"><List size={16} /></button><button aria-label="网格视图" aria-pressed={viewMode === "grid"} className={cn("grid h-9 w-9 place-items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500", viewMode === "grid" ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-slate-50")} onClick={() => onViewModeChange("grid")} type="button"><Grid2X2 size={16} /></button></div></div>
  </div>;
}
