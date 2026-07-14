"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import searchApi, {
  type HotSearchItem,
  type HotSearchQuery,
  type SearchEventType,
  type SearchHistoryItem,
  type SearchHit,
  type SearchListQuery,
  type SearchListResponse,
  type SearchMode,
  type SearchSortBy,
} from "@/services/search";
import foldersApi, { type Folder } from "@/services/folders";
import documentsApi, { type DocumentDto } from "@/services/documents";
import { getDocumentFileBlob } from "@/services/qa";
import { SearchFilters, type SearchFiltersValue } from "@/components/search/SearchFilters";
import { SearchLanding, type RecentSearchDocument, type SearchKnowledgeBase } from "@/components/search/SearchLanding";
import { SearchResultsToolbar } from "@/components/search/SearchResultsToolbar";
import { SearchResultList } from "@/components/search/SearchResultList";
import { SearchResultGrid } from "@/components/search/SearchResultGrid";
import { SearchPagination } from "@/components/search/SearchPagination";
import { type SelectedSearchFilter } from "@/components/search/SearchSelectedFilters";
import { SearchEmptyState, SearchErrorState, SearchLoadingSkeleton } from "@/components/search/SearchStatePanels";
import MarkdownPreviewModal from "@/components/MarkdownPreviewModal";
import PdfViewerModal from "@/components/PdfViewerModal";

const DEFAULT_PAGE_SIZE = 10;
const SEARCH_SORTS: SearchSortBy[] = ["relevance", "time", "name"];

interface ParsedSearchParams {
  keyword: string;
  mode: SearchMode;
  sort: SearchSortBy;
  page: number;
  viewMode: "list" | "grid";
  filters: SearchFiltersValue;
}

interface LandingErrors {
  categories?: string;
  recentDocuments?: string;
}

export default function SearchPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initial = useMemo(() => parseParams(searchParams), [searchParams]);
  const paramsKey = searchParams.toString();

  const [inputValue, setInputValue] = useState(initial.keyword);
  const [keyword, setKeyword] = useState(initial.keyword);
  const [mode, setMode] = useState<SearchMode>(initial.mode);
  const [filters, setFilters] = useState<SearchFiltersValue>(initial.filters);
  const [sort, setSort] = useState<SearchSortBy>(initial.sort);
  const [page, setPage] = useState(initial.page);
  const [viewMode, setViewMode] = useState<"list" | "grid">(initial.viewMode);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [result, setResult] = useState<SearchListResponse | null>(null);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [hotRange, setHotRange] = useState<NonNullable<HotSearchQuery["range"]>>("today");
  const [hotItems, setHotItems] = useState<HotSearchItem[]>([]);
  const [hotLoading, setHotLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState<SearchHistoryItem[]>([]);
  const [categories, setCategories] = useState<Folder[]>([]);
  const [recentDocuments, setRecentDocuments] = useState<DocumentDto[]>([]);
  const [landingLoading, setLandingLoading] = useState(true);
  const [landingErrors, setLandingErrors] = useState<LandingErrors>({});
  const [pdfPreview, setPdfPreview] = useState<{ id: string; title: string; page?: number; canDownload?: boolean } | null>(null);
  const [markdownPreview, setMarkdownPreview] = useState<{ id: string; title: string; canDownload?: boolean } | null>(null);
  const lastQueryKey = useRef("");
  const lastSuccessfulPage = useRef(1);
  const hasSuccessfulResult = useRef(false);
  const requestSeq = useRef(0);

  const hasActiveFilter = useMemo(() => hasAnySearchFilter(filters), [filters]);
  const isResultsState = keyword.trim().length > 0 || hasActiveFilter;
  const displayedPage = result?.page ?? page;
  const hasMore = result?.hasMore ?? (result ? displayedPage * result.pageSize < result.total : false);
  const knowledgeBaseOptions = useMemo(
    () => categories.map((category) => ({ value: category.id, label: category.name })),
    [categories],
  );
  const landingKnowledgeBases = useMemo<SearchKnowledgeBase[]>(
    () => categories.map((category) => ({ id: category.id, name: category.name })),
    [categories],
  );
  const landingRecentDocuments = useMemo<RecentSearchDocument[]>(
    () => recentDocuments.map((document) => ({
      id: document.id,
      title: document.title,
      path: categories.find((category) => category.id === document.folderId)?.name || "未设置路径",
      fileType: fileTypeOfDocument(document),
      updatedAt: document.updatedAt,
    })),
    [categories, recentDocuments],
  );
  const selectedFilterItems = useMemo<SelectedSearchFilter[]>(() => {
    const items: SelectedSearchFilter[] = [];
    if (filters.categoryId) {
      items.push({ key: "categoryId", label: "知识库", value: categories.find((item) => item.id === filters.categoryId)?.name || "已选知识库" });
    }
    if (filters.fileType) items.push({ key: "fileType", label: "文件类型", value: filters.fileType.toUpperCase() });
    if (isMeaningfulFilterValue(filters.updateTimeRange)) {
      const timeLabels: Record<string, string> = { today: "今天", "7d": "近 7 天", "30d": "近 30 天" };
      items.push({ key: "updateTimeRange", label: "更新时间", value: timeLabels[filters.updateTimeRange!] || filters.updateTimeRange! });
    }
    return items;
  }, [categories, filters]);

  const replaceUrl = useCallback(
    (next: {
      keyword?: string;
      mode?: SearchMode;
      filters?: SearchFiltersValue;
      sort?: SearchSortBy;
      page?: number;
      viewMode?: "list" | "grid";
    }) => {
      const params = new URLSearchParams();
      const nextKeyword = next.keyword ?? keyword;
      const nextMode = next.mode ?? mode;
      const nextFilters = next.filters ?? filters;
      const nextSort = next.sort ?? sort;
      const nextPage = next.page ?? page;
      const nextViewMode = next.viewMode ?? viewMode;

      if (nextKeyword.trim()) params.set("keyword", nextKeyword.trim());
      if (nextMode !== "hybrid") params.set("mode", nextMode);
      if (nextFilters.fileType) params.set("fileType", nextFilters.fileType);
      if (isMeaningfulFilterValue(nextFilters.updateTimeRange)) {
        params.set("updateTimeRange", nextFilters.updateTimeRange!);
      }
      if (nextFilters.categoryId) params.set("categoryId", nextFilters.categoryId);
      if (nextSort !== "relevance") params.set("sort", nextSort);
      if (nextPage > 1) params.set("page", String(nextPage));
      if (nextViewMode !== "list") params.set("viewMode", nextViewMode);

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [filters, keyword, mode, page, pathname, router, sort, viewMode],
  );

  const loadHistory = useCallback(async () => {
    try {
      setHistoryItems(await searchApi.getSearchHistory({ limit: 10 }));
    } catch {
      setHistoryItems([]);
    }
  }, []);

  const loadHotSearch = useCallback(async (range: NonNullable<HotSearchQuery["range"]>) => {
    setHotLoading(true);
    try {
      setHotItems(await searchApi.getHotSearch({ range, limit: 10 }));
    } catch {
      setHotItems([]);
    } finally {
      setHotLoading(false);
    }
  }, []);

  const loadLandingData = useCallback(async () => {
    setLandingLoading(true);
    const [folderResult, documentsResult] = await Promise.allSettled([
      foldersApi.tree(),
      documentsApi.list({ page: 1, pageSize: 12 }),
    ]);

    setLandingErrors({
      categories: folderResult.status === "rejected" ? "知识库暂时无法加载。" : undefined,
      recentDocuments: documentsResult.status === "rejected" ? "最近更新暂时无法加载。" : undefined,
    });

    if (folderResult.status === "fulfilled") {
      setCategories(flattenFolders(folderResult.value).slice(0, 8));
    }
    if (documentsResult.status === "fulfilled") {
      setRecentDocuments(
        [...documentsResult.value.items]
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
          .slice(0, 6),
      );
    }
    setLandingLoading(false);
  }, []);

  const runSearch = useCallback(
    async (
      nextKeyword = keyword,
      nextFilters = filters,
      nextMode = mode,
      nextSort = sort,
      nextPage = page,
    ) => {
      const trimmedKeyword = nextKeyword.trim();
      if (!trimmedKeyword && !hasAnySearchFilter(nextFilters)) {
        setResult(null);
        setHits([]);
        setError(null);
        setLoading(false);
        lastQueryKey.current = "";
        hasSuccessfulResult.current = false;
        return;
      }

      const query: SearchListQuery = {
        mode: nextMode,
        fileType: nextFilters.fileType || undefined,
        updateTimeRange: isMeaningfulFilterValue(nextFilters.updateTimeRange)
          ? nextFilters.updateTimeRange
          : undefined,
        categoryId: nextFilters.categoryId || undefined,
        sort: nextSort,
        page: nextPage,
        pageSize: DEFAULT_PAGE_SIZE,
      };
      if (trimmedKeyword) {
        query.keyword = trimmedKeyword;
        query.q = trimmedKeyword;
      }

      const queryKey = JSON.stringify(query);
      if (queryKey === lastQueryKey.current) return;
      lastQueryKey.current = queryKey;

      const requestId = ++requestSeq.current;
      setLoading(true);
      setError(null);
      try {
        const response = await searchApi.searchList(query);
        if (requestId !== requestSeq.current) return;
        setResult(response);
        setHits(response.hits);
        lastSuccessfulPage.current = response.page;
        hasSuccessfulResult.current = true;
        if (trimmedKeyword) void loadHistory();
      } catch (cause) {
        if (requestId !== requestSeq.current) return;
        lastQueryKey.current = "";
        // Keep the prior page visible during a failed refresh or page change.
        setError(cause instanceof Error ? cause.message : "搜索失败，请稍后重试。");
        if (hasSuccessfulResult.current && nextPage !== lastSuccessfulPage.current && typeof window !== "undefined") {
          const rollbackPage = lastSuccessfulPage.current;
          setPage(rollbackPage);
          const params = new URLSearchParams(window.location.search);
          if (rollbackPage > 1) params.set("page", String(rollbackPage));
          else params.delete("page");
          const query = params.toString();
          router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        }
      } finally {
        if (requestId === requestSeq.current) setLoading(false);
      }
    },
    [filters, keyword, loadHistory, mode, page, pathname, router, sort],
  );

  useEffect(() => {
    void loadHistory();
    void loadLandingData();
  }, [loadHistory, loadLandingData]);

  useEffect(() => {
    void loadHotSearch(hotRange);
  }, [hotRange, loadHotSearch]);

  useEffect(() => {
    const next = parseParams(new URLSearchParams(paramsKey));
    setInputValue(next.keyword);
    setKeyword(next.keyword);
    setMode(next.mode);
    setFilters(next.filters);
    setSort(next.sort);
    setPage(next.page);
    setViewMode(next.viewMode);
    if (!next.keyword.trim() && !hasAnySearchFilter(next.filters)) {
      requestSeq.current += 1;
      lastQueryKey.current = "";
      hasSuccessfulResult.current = false;
      setResult(null);
      setHits([]);
      setError(null);
      setLoading(false);
    }
  }, [paramsKey]);

  useEffect(() => {
    if (isResultsState) void runSearch(keyword, filters, mode, sort, page);
  }, [filters, isResultsState, keyword, mode, page, runSearch, sort]);

  const submitKeyword = useCallback(
    (value = inputValue) => {
      const nextKeyword = value.trim();
      setInputValue(nextKeyword);
      setKeyword(nextKeyword);
      setPage(1);
      replaceUrl({ keyword: nextKeyword, page: 1 });
    },
    [inputValue, replaceUrl],
  );

  const applyFilters = useCallback(
    (next: Partial<SearchFiltersValue>) => {
      const nextFilters = { ...filters, ...next };
      setFilters(nextFilters);
      setPage(1);
      replaceUrl({ filters: nextFilters, page: 1 });
    },
    [filters, replaceUrl],
  );

  const clearFilters = useCallback(() => {
    const nextFilters: SearchFiltersValue = {};
    setFilters(nextFilters);
    setPage(1);
    replaceUrl({ filters: nextFilters, page: 1 });
  }, [replaceUrl]);

  const clearAll = useCallback(() => {
    const nextFilters: SearchFiltersValue = {};
    setInputValue("");
    setKeyword("");
    setFilters(nextFilters);
    setMode("hybrid");
    setSort("relevance");
    setPage(1);
    setResult(null);
    setHits([]);
    lastQueryKey.current = "";
    hasSuccessfulResult.current = false;
    replaceUrl({ keyword: "", filters: nextFilters, mode: "hybrid", sort: "relevance", page: 1, viewMode });
  }, [replaceUrl, viewMode]);

  const handleModeChange = useCallback(
    (nextMode: SearchMode) => {
      setMode(nextMode);
      setPage(1);
      replaceUrl({ mode: nextMode, page: 1 });
    },
    [replaceUrl],
  );

  const handleSortChange = useCallback(
    (nextSort: SearchSortBy) => {
      setSort(nextSort);
      setPage(1);
      replaceUrl({ sort: nextSort, page: 1 });
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

  const handlePageChange = useCallback(
    (nextPage: number) => {
      if (nextPage < 1 || (nextPage > page && !hasMore)) return;
      setPage(nextPage);
      replaceUrl({ page: nextPage });
    },
    [hasMore, page, replaceUrl],
  );

  const handleHotSelect = useCallback(
    (term: string) => {
      setInputValue(term);
      setKeyword(term);
      setPage(1);
      replaceUrl({ keyword: term, page: 1 });
    },
    [replaceUrl],
  );

  const handleHistorySelect = useCallback(
    (item: SearchHistoryItem) => {
      setInputValue(item.query);
      setKeyword(item.query);
      setMode(item.mode);
      const nextSort = normalizeSearchSort(item.sortBy);
      setSort(nextSort);
      setPage(1);
      replaceUrl({ keyword: item.query, mode: item.mode, sort: nextSort, page: 1 });
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
    (category: Folder) => {
      const nextFilters: SearchFiltersValue = { ...filters, categoryId: category.id };
      setFilters(nextFilters);
      setPage(1);
      // A folder ID is the query scope, not a replacement keyword.
      replaceUrl({ filters: nextFilters, page: 1 });
    },
    [filters, replaceUrl],
  );

  const removeSelectedFilter = useCallback(
    (key: string) => {
      if (key === "categoryId") applyFilters({ categoryId: undefined });
      if (key === "fileType") applyFilters({ fileType: undefined });
      if (key === "updateTimeRange") applyFilters({ updateTimeRange: undefined });
    },
    [applyFilters],
  );

  const handleKnowledgeBaseSelect = useCallback(
    (item: SearchKnowledgeBase) => {
      const category = categories.find((entry) => entry.id === item.id);
      if (category) handleCategorySelect(category);
    },
    [categories, handleCategorySelect],
  );

  const openDocumentBlob = useCallback(async (
    documentId: string,
    title: string,
    download = false,
  ) => {
    if (typeof window === "undefined") return;
    setActionFeedback(null);
    const popup = download ? null : window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    try {
      const blob = await getDocumentFileBlob(documentId, { download });
      const blobUrl = URL.createObjectURL(blob);
      if (download) {
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = title;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1_000);
      } else if (popup) {
        popup.location.replace(blobUrl);
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      } else {
        window.open(blobUrl, "_blank", "noopener,noreferrer");
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      }
    } catch (cause) {
      popup?.close();
      setActionFeedback(cause instanceof Error ? cause.message : "文档打开失败，请稍后重试。");
    }
  }, []);

  const handleRecentDocumentSelect = useCallback((item: RecentSearchDocument) => {
    if (isMarkdownTitle(item.title)) {
      setMarkdownPreview({ id: item.id, title: item.title });
    } else if (isPdfTitle(item.title)) {
      setPdfPreview({ id: item.id, title: item.title });
    } else {
      void openDocumentBlob(item.id, item.title);
    }
  }, [openDocumentBlob]);

  const recordHitEvent = useCallback(
    (hit: SearchHit, eventType: SearchEventType) => {
      if (!keyword.trim()) return;
      void searchApi
        .recordSearchEvent({
          keyword: keyword.trim(),
          eventType,
          documentId: hit.documentId,
          interactionToken: hit.interactionToken ?? null,
        })
        .catch(() => undefined);
    },
    [keyword],
  );

  const openOriginalSearchHit = useCallback((hit: SearchHit) => {
    recordHitEvent(hit, "DOCUMENT_VIEW");
    void openDocumentBlob(hit.documentId, hit.documentTitle);
  }, [openDocumentBlob, recordHitEvent]);

  const previewSearchHit = useCallback(
    (hit: SearchHit) => {
      recordHitEvent(hit, "DOCUMENT_VIEW");
      if (isMarkdownHit(hit)) {
        setMarkdownPreview({ id: hit.documentId, title: hit.documentTitle, canDownload: hit.canDownload !== false });
      } else if (isPdfHit(hit)) {
        setPdfPreview({ id: hit.documentId, title: hit.documentTitle, page: hit.page ?? undefined, canDownload: hit.canDownload !== false });
      } else {
        void openDocumentBlob(hit.documentId, hit.documentTitle);
      }
    },
    [openDocumentBlob, recordHitEvent],
  );

  const downloadSearchHit = useCallback((hit: SearchHit) => {
    if (!hit.canDownload) {
      setActionFeedback("你没有下载此文档的权限。");
      return;
    }
    recordHitEvent(hit, "DOCUMENT_DOWNLOAD");
    void openDocumentBlob(hit.documentId, hit.documentTitle, true);
  }, [openDocumentBlob, recordHitEvent]);

  if (!isResultsState) {
    return (
      <>
        <div data-search-state="landing">
          <SearchLanding
            inputValue={inputValue}
            hotItems={hotItems}
            historyItems={historyItems}
            hotRange={hotRange}
            hotLoading={hotLoading}
            knowledgeBases={landingKnowledgeBases}
            recentDocuments={landingRecentDocuments}
            knowledgeBasesLoading={landingLoading}
            recentDocumentsLoading={landingLoading}
            knowledgeBasesError={landingErrors.categories}
            recentDocumentsError={landingErrors.recentDocuments}
            advancedOpen={advancedOpen}
            filtersContent={advancedOpen ? (
              <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
                <SearchFilters
                  value={filters}
                  expanded
                  knowledgeBases={knowledgeBaseOptions}
                  mode={mode}
                  showPermission={false}
                  onModeChange={handleModeChange}
                  onChange={applyFilters}
                  onClear={clearFilters}
                  onToggleExpanded={() => setAdvancedOpen(false)}
                />
              </div>
            ) : undefined}
            onInputChange={setInputValue}
            onSubmit={() => submitKeyword()}
            onAdvancedSearch={() => setAdvancedOpen((open) => !open)}
            onHotRangeChange={setHotRange}
            onHotSelect={handleHotSelect}
            onHistorySelect={handleHistorySelect}
            onHistoryDelete={handleHistoryDelete}
            onHistoryClear={handleHistoryClear}
            onKnowledgeBaseSelect={handleKnowledgeBaseSelect}
            onRecentDocumentSelect={handleRecentDocumentSelect}
          />
        </div>
        {pdfPreview && <PdfViewerModal documentId={pdfPreview.id} title={pdfPreview.title} initialPage={pdfPreview.page} canDownload={pdfPreview.canDownload} onClose={() => setPdfPreview(null)} />}
        {markdownPreview && <MarkdownPreviewModal documentId={markdownPreview.id} title={markdownPreview.title} canDownload={markdownPreview.canDownload} onClose={() => setMarkdownPreview(null)} />}
      </>
    );
  }

  return (
    <div className="min-h-full bg-slate-50" data-search-state="results">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2 px-4 pt-4 sm:px-8">
          <SearchBox inputValue={inputValue} compact onInputChange={setInputValue} onSubmit={() => submitKeyword()} />
          <button
            aria-label="清空搜索条件"
            className="grid h-11 w-11 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
            onClick={clearAll}
            type="button"
          >
            <X size={17} />
          </button>
        </div>

        <SearchFilters
          id="search-filters"
          value={filters}
          expanded={advancedOpen}
          knowledgeBases={knowledgeBaseOptions}
          mode={mode}
          showPermission={false}
          onModeChange={handleModeChange}
          onChange={applyFilters}
          onClear={clearFilters}
          onToggleExpanded={() => setAdvancedOpen((open) => !open)}
        />
      </div>

      <SearchResultsToolbar
        total={result?.total ?? hits.length}
        took={result?.took}
        sort={sort}
        viewMode={viewMode}
        page={displayedPage}
        pageSize={DEFAULT_PAGE_SIZE}
        truncated={result?.truncated}
        resultLimit={result?.resultLimit}
        permissionNotice={hits.some((hit) => hit.canDownload === false)}
        selectedFilters={selectedFilterItems}
        onSortChange={handleSortChange}
        onViewModeChange={handleViewModeChange}
        onRemoveFilter={removeSelectedFilter}
        onClearFilters={clearFilters}
      />

      {loading && hits.length > 0 && (
        <div aria-live="polite" className="flex min-h-11 items-center gap-2 border-y border-brand-100 bg-brand-50 px-8 text-sm text-brand-800">
          正在更新搜索结果…
        </div>
      )}

      {loading && hits.length === 0 && <SearchLoadingSkeleton />}

      {error && hits.length === 0 && <SearchErrorState message={error} onRetry={() => void runSearch()} />}

      {error && hits.length > 0 && <SearchErrorState message={`${error}，当前仍显示上一次结果。`} onRetry={() => void runSearch()} />}

      {actionFeedback && (
        <div aria-live="polite" className="mx-4 my-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 sm:mx-8">
          {actionFeedback}
        </div>
      )}

      {!loading && !error && hits.length === 0 && <SearchEmptyState filtered onClear={clearFilters} />}

      {hits.length > 0 && (viewMode === "list" ? (
        <SearchResultList
          hits={hits}
          keyword={keyword}
          onPreview={previewSearchHit}
          onOpenOriginal={openOriginalSearchHit}
          onDownload={downloadSearchHit}
        />
      ) : (
        <SearchResultGrid
          hits={hits}
          keyword={keyword}
          onPreview={previewSearchHit}
          onOpenOriginal={openOriginalSearchHit}
          onDownload={downloadSearchHit}
        />
      ))}

      {(hits.length > 0 || result) && (
        <SearchPagination page={displayedPage} pageSize={DEFAULT_PAGE_SIZE} total={result?.total ?? hits.length} truncated={result?.truncated} onPageChange={handlePageChange} />
      )}

      {pdfPreview && <PdfViewerModal documentId={pdfPreview.id} title={pdfPreview.title} initialPage={pdfPreview.page} canDownload={pdfPreview.canDownload} onClose={() => setPdfPreview(null)} />}
      {markdownPreview && <MarkdownPreviewModal documentId={markdownPreview.id} title={markdownPreview.title} canDownload={markdownPreview.canDownload} onClose={() => setMarkdownPreview(null)} />}
    </div>
  );
}

function SearchBox({
  inputValue,
  compact = false,
  onInputChange,
  onSubmit,
}: {
  inputValue: string;
  compact?: boolean;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className={compact ? "flex min-w-0 flex-1 flex-wrap gap-2" : "mt-6 flex flex-wrap gap-2"}>
      <label className="sr-only" htmlFor="search-keyword">搜索关键词</label>
      <div className="relative min-w-[220px] flex-1">
        <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200"
          id="search-keyword"
          placeholder="输入文档标题或内容关键词"
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSubmit();
          }}
        />
      </div>
      <button className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-5 text-sm font-medium text-white transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2" onClick={onSubmit} type="button">
        <Search size={16} />
        搜索
      </button>
    </div>
  );
}

function parseParams(params: Pick<URLSearchParams, "get">): ParsedSearchParams {
  const rawSort = params.get("sort");
  const rawMode = params.get("mode");
  const rawPage = Number(params.get("page"));
  return {
    keyword: params.get("keyword") || params.get("q") || "",
    mode: rawMode === "semantic" || rawMode === "keyword" ? rawMode : "hybrid",
    sort: rawSort && SEARCH_SORTS.includes(rawSort as SearchSortBy) ? (rawSort as SearchSortBy) : "relevance",
    page: Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    viewMode: params.get("viewMode") === "grid" ? "grid" : "list",
    filters: {
      fileType: params.get("fileType") || undefined,
      updateTimeRange: normalizeUpdateTimeRange(params.get("updateTimeRange")),
      categoryId: params.get("categoryId") || undefined,
    },
  };
}

function flattenFolders(folders: Folder[]): Folder[] {
  return folders.flatMap((folder) => [folder, ...flattenFolders(folder.children ?? [])]);
}

function isMeaningfulFilterValue(value: unknown) {
  return Boolean(value && value !== "all");
}

function hasAnySearchFilter(value: SearchFiltersValue) {
  return Boolean(value.fileType || value.categoryId || isMeaningfulFilterValue(value.updateTimeRange));
}

function normalizeUpdateTimeRange(value: string | null): SearchFiltersValue["updateTimeRange"] | undefined {
  return value === "today" || value === "7d" || value === "30d" ? value : undefined;
}

function normalizeSearchSort(value: SearchSortBy): SearchSortBy {
  return SEARCH_SORTS.includes(value) ? value : "relevance";
}

function isMarkdownTitle(title: string) {
  const lower = title.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

function isPdfTitle(title: string) {
  return title.toLowerCase().endsWith(".pdf");
}

function isMarkdownHit(hit: SearchHit) {
  return hit.mime?.toLowerCase().includes("markdown") || isMarkdownTitle(hit.documentTitle);
}

function isPdfHit(hit: SearchHit) {
  return hit.mime?.toLowerCase() === "application/pdf" || isPdfTitle(hit.documentTitle);
}

function fileTypeOfDocument(document: DocumentDto) {
  const mime = (document.mime || "").toLowerCase();
  const title = document.title.toLowerCase();
  if (mime === "application/pdf" || title.endsWith(".pdf")) return "PDF";
  if (mime.includes("word") || /\.docx?$/.test(title)) return "DOCX";
  if (mime.includes("sheet") || /\.xlsx?$/.test(title)) return "XLSX";
  if (mime.includes("presentation") || /\.pptx?$/.test(title)) return "PPTX";
  if (mime.startsWith("text/") || isMarkdownTitle(title)) return "TXT";
  return "FILE";
}
