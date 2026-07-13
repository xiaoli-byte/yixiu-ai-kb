import { AlertCircle, Grid2X2, List, SlidersHorizontal } from "lucide-react";
import type { SearchSortBy } from "@/services/search";
import { cn } from "@/lib/utils";

interface SearchResultsToolbarProps {
  total: number; took?: number; sort: SearchSortBy; viewMode: "list" | "grid"; permissionNotice?: boolean; page?: number; pageSize?: number; truncated?: boolean; resultLimit?: number;
  onSortChange: (sort: SearchSortBy) => void; onViewModeChange: (mode: "list" | "grid") => void;
}
const SORT_OPTIONS: Array<{ value: SearchSortBy; label: string }> = [
  { value: "relevance", label: "相关度排序" }, { value: "time", label: "时间排序" }, { value: "name", label: "名称排序" },
];

export function SearchResultsToolbar({ total, took, sort, viewMode, permissionNotice = false, page = 1, pageSize = 10, truncated = false, resultLimit, onSortChange, onViewModeChange }: SearchResultsToolbarProps) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-8">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2"><span className="text-sm font-medium text-slate-900">{truncated ? `当前展示 ${total.toLocaleString("zh-CN")} 条结果` : `${total.toLocaleString("zh-CN")} 条结果`}</span>{truncated && <span className="text-xs text-amber-700">候选结果已截断{resultLimit ? `（上限 ${resultLimit.toLocaleString("zh-CN")} 条）` : ""}</span>}<span className="text-xs text-slate-500">显示 {start}–{end}</span>{typeof took === "number" && <span className="text-xs text-slate-500">耗时 {(took / 1000).toFixed(2)} 秒</span>}{permissionNotice && <span className="inline-flex min-h-7 items-center gap-1 rounded bg-amber-50 px-2 text-xs text-amber-800"><AlertCircle size={13} />部分文档可预览，但不可下载</span>}</div>
    <div className="flex items-center gap-2"><label className="inline-flex h-10 items-center gap-1 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700"><SlidersHorizontal aria-hidden="true" className="text-slate-400" size={13} /><span className="sr-only">排序方式</span><select aria-label="排序方式" className="h-8 bg-transparent text-xs outline-none focus-visible:ring-2 focus-visible:ring-brand-500" value={sort} onChange={(event) => onSortChange(event.target.value as SearchSortBy)}>{SORT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><div aria-label="结果视图" className="flex items-center rounded border border-slate-200 p-0.5"><button aria-label="列表视图" aria-pressed={viewMode === "list"} className={cn("grid h-9 w-9 place-items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500", viewMode === "list" ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50")} onClick={() => onViewModeChange("list")} type="button"><List size={16} /></button><button aria-label="网格视图" aria-pressed={viewMode === "grid"} className={cn("grid h-9 w-9 place-items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500", viewMode === "grid" ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50")} onClick={() => onViewModeChange("grid")} type="button"><Grid2X2 size={16} /></button></div></div>
  </div>;
}
