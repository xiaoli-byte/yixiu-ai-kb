import { Search } from "lucide-react";
import type { HotSearchItem, HotSearchQuery, SearchHistoryItem } from "@/services/search";
import { HotSearchPanel } from "./HotSearchPanel";
import { SearchHistoryPanel } from "./SearchHistoryPanel";
import { SearchSectionNav } from "./SearchSectionNav";
import { cn } from "@/lib/utils";

export interface RecommendedCategory {
  id: string;
  label: string;
  target: "categoryId" | "tagId";
}

interface SearchLandingProps {
  inputValue: string;
  hotItems: HotSearchItem[];
  historyItems: SearchHistoryItem[];
  recommendedCategories: RecommendedCategory[];
  selectedCategoryId?: string;
  selectedTagId?: string;
  hotRange: NonNullable<HotSearchQuery["range"]>;
  hotLoading?: boolean;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onAdvancedSearch: () => void;
  onHotRangeChange: (range: NonNullable<HotSearchQuery["range"]>) => void;
  onHotSelect: (keyword: string) => void;
  onHistorySelect: (item: SearchHistoryItem) => void;
  onHistoryDelete: (id: string) => void;
  onHistoryClear: () => void;
  onCategorySelect: (item: RecommendedCategory) => void;
}

export function SearchLanding({
  inputValue,
  hotItems,
  historyItems,
  recommendedCategories,
  selectedCategoryId,
  selectedTagId,
  hotRange,
  hotLoading = false,
  onInputChange,
  onSubmit,
  onAdvancedSearch,
  onHotRangeChange,
  onHotSelect,
  onHistorySelect,
  onHistoryDelete,
  onHistoryClear,
  onCategorySelect,
}: SearchLandingProps) {
  return (
    <div className="flex min-h-full bg-white">
      <SearchSectionNav onFilterClick={onAdvancedSearch} />
      <div className="min-w-0 flex-1 px-8 py-8">
        <div className="flex flex-col items-center pb-10 pt-8">
          <div className="flex w-full max-w-[720px] items-center gap-2">
            <div className="relative h-10 flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="h-10 w-full rounded border border-slate-300 bg-white pl-10 pr-3 text-[13px] outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                placeholder="请输入文档标题、内容关键词"
                value={inputValue}
                onChange={(event) => onInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSubmit();
                }}
              />
            </div>
            <button
              className="inline-flex h-10 items-center gap-1.5 rounded bg-brand-600 px-5 text-[13px] font-medium text-white transition hover:bg-brand-700"
              onClick={onSubmit}
              type="button"
            >
              <Search size={14} />
              搜索
            </button>
          </div>
          <button
            className="mt-2 h-7 rounded px-2 text-xs text-brand-700 hover:bg-brand-50"
            onClick={onAdvancedSearch}
            type="button"
          >
            高级搜索
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]">
          <HotSearchPanel
            id="hot-search"
            items={hotItems}
            activeRange={hotRange}
            loading={hotLoading}
            onRangeChange={onHotRangeChange}
            onSelect={onHotSelect}
          />
          <div className="space-y-6">
            <SearchHistoryPanel
              id="search-history"
              items={historyItems}
              onSelect={onHistorySelect}
              onDelete={onHistoryDelete}
              onClear={onHistoryClear}
            />
            <section>
              <div className="border-b border-slate-200 pb-3">
                <h2 className="text-sm font-medium text-slate-900">推荐分类</h2>
              </div>
              <div className="flex flex-wrap gap-2 pt-4">
                {recommendedCategories.map((item) => {
                  const active =
                    (item.target === "categoryId" && selectedCategoryId === item.id) ||
                    (item.target === "tagId" && selectedTagId === item.id);
                  return (
                    <button
                      key={`${item.target}-${item.id}`}
                      className={cn(
                        "h-7 rounded border px-3 text-xs transition",
                        active
                          ? "border-brand-200 bg-brand-50 text-brand-700"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
                      )}
                      onClick={() => onCategorySelect(item)}
                      type="button"
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
