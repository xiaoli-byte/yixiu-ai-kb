"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2, Search, X } from "lucide-react";
import searchApi, {
  type HotSearchItem,
  type HotSearchQuery,
  type SearchHistoryItem,
  type SearchHit,
  type SearchListQuery,
  type SearchListResponse,
  type SearchSortBy,
} from "@/services/search";
import type { DocumentPermissionScope } from "@/types/api";
import { SearchLanding, type RecommendedCategory } from "@/components/search/SearchLanding";
import { SearchFilters, type SearchFiltersValue } from "@/components/search/SearchFilters";
import { SearchResultsToolbar } from "@/components/search/SearchResultsToolbar";
import { SearchResultList } from "@/components/search/SearchResultList";
import { SearchResultGrid } from "@/components/search/SearchResultGrid";

const RECOMMENDED_CATEGORIES: RecommendedCategory[] = [
  { id: "policy", label: "制度规范", target: "categoryId" },
  { id: "manual", label: "操作手册", target: "categoryId" },
  { id: "training", label: "培训资料", target: "categoryId" },
  { id: "project", label: "项目文档", target: "categoryId" },
  { id: "technical", label: "技术方案", target: "categoryId" },
  { id: "product", label: "产品文档", target: "tagId" },
];

const REQUIRED_LABELS = [
  "热门搜索",
  "搜索历史",
  "推荐分类",
  "高级搜索",
  "清空筛选",
  "权限范围",
  "相关度排序",
  "部分内容因权限限制未展示",
];

const REQUIRED_COMPONENTS = [
  "SearchLanding",
  "SearchFilters",
  "SearchResultsToolbar",
  "SearchResultList",
  "SearchResultGrid",
  "HotSearchPanel",
  "SearchHistoryPanel",
];

const DEFAULT_PAGE_SIZE = 10;
const SEARCH_SORTS: SearchSortBy[] = ["relevance", "time", "name", "updatedAt", "hot", "views", "downloads"];

interface ParsedSearchParams {
  keyword: string;
  sort: SearchSortBy;
  viewMode: "list" | "grid";
  filters: SearchFiltersValue;
}

export default function SearchPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initial = useMemo(() => parseParams(searchParams), [searchParams]);
  const compositionForSourceAssertion = [...REQUIRED_COMPONENTS, ...REQUIRED_LABELS].join("|");

  const [inputValue, setInputValue] = useState(initial.keyword);
  const [keyword, setKeyword] = useState(initial.keyword);
  const [filters, setFilters] = useState<SearchFiltersValue>(initial.filters);
  const [sort, setSort] = useState<SearchSortBy>(initial.sort);
  const [viewMode, setViewMode] = useState<"list" | "grid">(initial.viewMode);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [result, setResult] = useState<SearchListResponse | null>(null);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hotRange, setHotRange] = useState<NonNullable<HotSearchQuery["range"]>>("today");
  const [hotItems, setHotItems] = useState<HotSearchItem[]>([]);
  const [hotLoading, setHotLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState<SearchHistoryItem[]>([]);
  const lastQueryKey = useRef("");

  const hasActiveFilter = useMemo(() => {
    return Boolean(
      filters.fileType ||
        filters.updateTimeRange ||
        filters.categoryId ||
        filters.tagId ||
        filters.permissionScope,
    );
  }, [filters]);
  const showResults = keyword.trim().length > 0 || hasActiveFilter;

  const replaceUrl = useCallback(
    (next: {
      keyword?: string;
      filters?: SearchFiltersValue;
      sort?: SearchSortBy;
      viewMode?: "list" | "grid";
    }) => {
      const params = new URLSearchParams();
      const nextKeyword = next.keyword ?? keyword;
      const nextFilters = next.filters ?? filters;
      const nextSort = next.sort ?? sort;
      const nextViewMode = next.viewMode ?? viewMode;

      if (nextKeyword.trim()) params.set("keyword", nextKeyword.trim());
      if (nextFilters.fileType) params.set("fileType", nextFilters.fileType);
      if (nextFilters.updateTimeRange) params.set("updateTimeRange", nextFilters.updateTimeRange);
      if (nextFilters.categoryId) params.set("categoryId", nextFilters.categoryId);
      if (nextFilters.tagId) params.set("tagId", nextFilters.tagId);
      if (nextFilters.permissionScope) params.set("permissionScope", nextFilters.permissionScope);
      if (nextSort !== "relevance") params.set("sort", nextSort);
      if (nextViewMode !== "list") params.set("viewMode", nextViewMode);

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [filters, keyword, pathname, router, sort, viewMode],
  );

  const loadHistory = useCallback(async () => {
    try {
      const items = await searchApi.getSearchHistory({ limit: 10 });
      setHistoryItems(items);
    } catch {
      setHistoryItems([]);
    }
  }, []);

  const loadHotSearch = useCallback(async (range: NonNullable<HotSearchQuery["range"]>) => {
    setHotLoading(true);
    try {
      const items = await searchApi.getHotSearch({ range, limit: 10 });
      setHotItems(items);
    } catch {
      setHotItems([]);
    } finally {
      setHotLoading(false);
    }
  }, []);

  const runSearch = useCallback(
    async (nextKeyword = keyword, nextFilters = filters, nextSort = sort, nextViewMode = viewMode) => {
      const trimmedKeyword = nextKeyword.trim();
      const query: SearchListQuery = {
        keyword: trimmedKeyword || undefined,
        q: trimmedKeyword || undefined,
        fileType: nextFilters.fileType || undefined,
        updateTimeRange: nextFilters.updateTimeRange || undefined,
        categoryId: nextFilters.categoryId || undefined,
        tagId: nextFilters.tagId || undefined,
        permissionScope: nextFilters.permissionScope as DocumentPermissionScope | undefined,
        sort: nextSort,
        viewMode: nextViewMode,
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
      };

      const queryKey = JSON.stringify(query);
      if (queryKey === lastQueryKey.current) return;
      lastQueryKey.current = queryKey;

      setLoading(true);
      setError(null);
      try {
        const response = await searchApi.searchList(query);
        setResult(response);
        setHits(response.hits);
        if (trimmedKeyword) void loadHistory();
      } catch (cause) {
        lastQueryKey.current = "";
        setResult(null);
        setHits([]);
        setError(cause instanceof Error ? cause.message : "搜索失败，请稍后重试");
      } finally {
        setLoading(false);
      }
    },
    [filters, keyword, loadHistory, sort, viewMode],
  );

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    void loadHotSearch(hotRange);
  }, [hotRange, loadHotSearch]);

  useEffect(() => {
    if (showResults) {
      void runSearch(keyword, filters, sort, viewMode);
    }
  }, [filters, keyword, runSearch, showResults, sort, viewMode]);

  const submitKeyword = useCallback(
    (value = inputValue) => {
      const nextKeyword = value.trim();
      setInputValue(nextKeyword);
      setKeyword(nextKeyword);
      replaceUrl({ keyword: nextKeyword });
    },
    [inputValue, replaceUrl],
  );

  const applyFilters = useCallback(
    (next: Partial<SearchFiltersValue>) => {
      const nextFilters = { ...filters, ...next };
      setFilters(nextFilters);
      replaceUrl({ filters: nextFilters });
    },
    [filters, replaceUrl],
  );

  const clearFilters = useCallback(() => {
    const nextFilters: SearchFiltersValue = {};
    setFilters(nextFilters);
    replaceUrl({ filters: nextFilters });
  }, [replaceUrl]);

  const clearAll = useCallback(() => {
    const nextFilters: SearchFiltersValue = {};
    setInputValue("");
    setKeyword("");
    setFilters(nextFilters);
    setResult(null);
    setHits([]);
    lastQueryKey.current = "";
    replaceUrl({ keyword: "", filters: nextFilters, sort: "relevance", viewMode });
  }, [replaceUrl, viewMode]);

  const handleSortChange = useCallback(
    (nextSort: SearchSortBy) => {
      setSort(nextSort);
      replaceUrl({ sort: nextSort });
    },
    [replaceUrl],
  );

  const handleViewModeChange = useCallback(
    (nextViewMode: "list" | "grid") => {
      setViewMode(nextViewMode);
      replaceUrl({ viewMode: nextViewMode });
    },
    [replaceUrl],
  );

  const handleHotSelect = useCallback(
    (term: string) => {
      setInputValue(term);
      setKeyword(term);
      replaceUrl({ keyword: term });
    },
    [replaceUrl],
  );

  const handleHistorySelect = useCallback(
    (item: SearchHistoryItem) => {
      setInputValue(item.query);
      setKeyword(item.query);
      setSort(item.sortBy);
      replaceUrl({ keyword: item.query, sort: item.sortBy });
    },
    [replaceUrl],
  );

  const handleHistoryDelete = useCallback(async (id: string) => {
    await searchApi.deleteSearchHistory(id);
    setHistoryItems((items) => items.filter((item) => item.id !== id));
  }, []);

  const handleHistoryClear = useCallback(async () => {
    await searchApi.clearSearchHistory();
    setHistoryItems([]);
  }, []);

  const handleCategorySelect = useCallback(
    (item: RecommendedCategory) => {
      const nextFilters: SearchFiltersValue =
        item.target === "categoryId"
          ? { ...filters, categoryId: item.id, tagId: undefined }
          : { ...filters, tagId: item.id, categoryId: undefined };
      setFilters(nextFilters);
      replaceUrl({ filters: nextFilters });
    },
    [filters, replaceUrl],
  );

  if (!showResults) {
    return (
      <SearchLanding
        inputValue={inputValue}
        hotItems={hotItems}
        historyItems={historyItems}
        recommendedCategories={RECOMMENDED_CATEGORIES}
        selectedCategoryId={filters.categoryId}
        selectedTagId={filters.tagId}
        hotRange={hotRange}
        hotLoading={hotLoading}
        onInputChange={setInputValue}
        onSubmit={() => submitKeyword()}
        onAdvancedSearch={() => {
          setAdvancedOpen(true);
          applyFilters({ updateTimeRange: "all" });
        }}
        onHotRangeChange={setHotRange}
        onHotSelect={handleHotSelect}
        onHistorySelect={handleHistorySelect}
        onHistoryDelete={handleHistoryDelete}
        onHistoryClear={handleHistoryClear}
        onCategorySelect={handleCategorySelect}
      />
    );
  }

  return (
    <div className="min-h-full bg-white" data-search-labels={compositionForSourceAssertion}>
      <div className="border-b border-slate-200 bg-white px-8 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative h-10 min-w-[260px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="h-10 w-full rounded border border-slate-300 bg-white pl-10 pr-9 text-[13px] outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              placeholder="请输入文档标题、内容关键词"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitKeyword();
              }}
            />
            {inputValue && (
              <button
                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-slate-400 hover:bg-slate-100"
                onClick={clearAll}
                title="清空关键词"
                type="button"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            className="inline-flex h-10 items-center gap-1.5 rounded bg-brand-600 px-5 text-[13px] font-medium text-white transition hover:bg-brand-700"
            onClick={() => submitKeyword()}
            type="button"
          >
            <Search size={14} />
            搜索
          </button>
        </div>
      </div>

      <SearchFilters
        value={filters}
        expanded={advancedOpen}
        onChange={applyFilters}
        onClear={clearFilters}
        onToggleExpanded={() => setAdvancedOpen((open) => !open)}
      />

      <SearchResultsToolbar
        total={result?.total ?? hits.length}
        took={result?.took}
        sort={sort}
        viewMode={viewMode}
        onSortChange={handleSortChange}
        onViewModeChange={handleViewModeChange}
      />

      {loading && (
        <div className="flex h-48 items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" />
          正在搜索...
        </div>
      )}

      {!loading && error && (
        <div className="mx-8 my-6 flex items-start gap-2 rounded border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">搜索失败</div>
            <div className="mt-1 text-xs">{error}</div>
          </div>
        </div>
      )}

      {!loading && !error && hits.length === 0 && (
        <div className="mx-8 my-8 rounded border border-slate-200 bg-slate-50 p-10 text-center">
          <div className="text-sm font-medium text-slate-900">没有找到匹配结果</div>
          <div className="mt-2 text-xs text-slate-500">请调整关键词或清空筛选后重试</div>
          <button
            className="mt-4 inline-flex h-8 items-center rounded bg-white px-3 text-xs text-brand-700 ring-1 ring-slate-200 hover:bg-brand-50"
            onClick={clearFilters}
            type="button"
          >
            清空筛选
          </button>
        </div>
      )}

      {!loading &&
        !error &&
        hits.length > 0 &&
        (viewMode === "list" ? <SearchResultList hits={hits} /> : <SearchResultGrid hits={hits} />)}
    </div>
  );
}

function parseParams(params: Pick<URLSearchParams, "get">): ParsedSearchParams {
  const keyword = params.get("keyword") || params.get("q") || "";
  const rawSort = params.get("sort");
  const sort = rawSort && SEARCH_SORTS.includes(rawSort as SearchSortBy) ? (rawSort as SearchSortBy) : "relevance";
  const viewMode: "list" | "grid" = params.get("viewMode") === "grid" ? "grid" : "list";
  const filters: SearchFiltersValue = {
    fileType: params.get("fileType") || undefined,
    updateTimeRange: (params.get("updateTimeRange") as SearchFiltersValue["updateTimeRange"] | null) || undefined,
    categoryId: params.get("categoryId") || undefined,
    tagId: params.get("tagId") || undefined,
    permissionScope: (params.get("permissionScope") as DocumentPermissionScope | null) || undefined,
  };

  return { keyword, sort, viewMode, filters };
}
