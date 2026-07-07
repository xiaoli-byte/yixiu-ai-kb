import { AlertCircle, Grid2X2, List, SlidersHorizontal } from "lucide-react";
import type { SearchSortBy } from "@/services/search";
import { cn } from "@/lib/utils";

interface SearchResultsToolbarProps {
  total: number;
  took?: number;
  sort: SearchSortBy;
  viewMode: "list" | "grid";
  permissionNotice?: boolean;
  onSortChange: (sort: SearchSortBy) => void;
  onViewModeChange: (mode: "list" | "grid") => void;
}

const SORT_OPTIONS: Array<{ value: SearchSortBy; label: string }> = [
  { value: "relevance", label: "相关度排序" },
  { value: "updatedAt", label: "更新时间倒序" },
  { value: "hot", label: "热度排序" },
  { value: "views", label: "浏览量排序" },
  { value: "downloads", label: "下载量排序" },
];

export function SearchResultsToolbar({
  total,
  took,
  sort,
  viewMode,
  permissionNotice = true,
  onSortChange,
  onViewModeChange,
}: SearchResultsToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-8 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-900">共找到 {total} 条结果</span>
        {typeof took === "number" && <span className="text-xs text-slate-500">耗时 {took}ms</span>}
        {permissionNotice && (
          <span className="inline-flex h-7 items-center gap-1 rounded bg-amber-50 px-2 text-xs text-amber-700">
            <AlertCircle size={13} />
            部分内容因权限限制未展示
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <label className="inline-flex h-8 items-center gap-1 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700">
          <SlidersHorizontal size={13} className="text-slate-400" />
          <select
            className="h-7 bg-transparent text-xs outline-none"
            value={sort}
            onChange={(event) => onSortChange(event.target.value as SearchSortBy)}
          >
            {SORT_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex h-8 items-center gap-1">
          <button
            className={cn(
              "grid h-8 w-8 place-items-center border-b-2",
              viewMode === "list" ? "border-brand-600 text-brand-700" : "border-transparent text-slate-400",
            )}
            onClick={() => onViewModeChange("list")}
            title="列表视图"
            type="button"
          >
            <List size={16} />
          </button>
          <button
            className={cn(
              "grid h-8 w-8 place-items-center border-b-2",
              viewMode === "grid" ? "border-brand-600 text-brand-700" : "border-transparent text-slate-400",
            )}
            onClick={() => onViewModeChange("grid")}
            title="宫格视图"
            type="button"
          >
            <Grid2X2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
