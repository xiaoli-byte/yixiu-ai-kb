import { ArrowRight, BookOpen, Clock3, FileText, FolderOpen, Search, Sparkles } from "lucide-react";
import type { HotSearchItem, HotSearchQuery, SearchHistoryItem } from "@/services/search";
import { HotSearchPanel } from "./HotSearchPanel";
import { fileBadgeText, fileBadgeTone } from "./SearchResultList";
import { SearchHistoryPanel } from "./SearchHistoryPanel";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface RecommendedCategory { id: string; label: string; target: "categoryId"; }
export interface SearchKnowledgeBase { id: string; name: string; description?: string; documentCount?: number; folderCount?: number; href?: string; }
export interface RecentSearchDocument { id: string; title: string; path?: string; fileType?: string; mime?: string; canDownload?: boolean; updatedAt?: string; href?: string; }

interface SearchLandingProps {
  inputValue: string; hotItems: HotSearchItem[]; historyItems: SearchHistoryItem[]; recommendedCategories?: RecommendedCategory[]; selectedCategoryId?: string; hotRange: NonNullable<HotSearchQuery["range"]>; hotLoading?: boolean;
  knowledgeBases?: SearchKnowledgeBase[]; recentDocuments?: RecentSearchDocument[]; knowledgeBasesLoading?: boolean; recentDocumentsLoading?: boolean;
  knowledgeBasesError?: string; recentDocumentsError?: string; filtersContent?: ReactNode;
  advancedOpen?: boolean;
  onInputChange: (value: string) => void; onSubmit: () => void; onAdvancedSearch?: () => void; onHotRangeChange: (range: NonNullable<HotSearchQuery["range"]>) => void; onHotSelect: (keyword: string) => void; onHistorySelect: (item: SearchHistoryItem) => void; onHistoryDelete: (id: string) => void; onHistoryClear: () => void; onCategorySelect?: (item: RecommendedCategory) => void; onKnowledgeBaseSelect?: (item: SearchKnowledgeBase) => void; onRecentDocumentSelect?: (item: RecentSearchDocument) => void;
}

export function SearchLanding({
  inputValue, hotItems, historyItems, recommendedCategories = [], selectedCategoryId, hotRange, hotLoading = false,
  knowledgeBases = [], recentDocuments = [], knowledgeBasesLoading = false, recentDocumentsLoading = false,
  knowledgeBasesError, recentDocumentsError, filtersContent, advancedOpen = false,
  onInputChange, onSubmit, onAdvancedSearch, onHotRangeChange, onHotSelect, onHistorySelect, onHistoryDelete, onHistoryClear, onCategorySelect, onKnowledgeBaseSelect, onRecentDocumentSelect,
}: SearchLandingProps) {
  return (
    <main className="min-h-full bg-slate-50 px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-[1280px] space-y-6">
        {/* Hero：搜索为焦点，底部整合常用知识库快捷入口 */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
          <div className="px-6 py-7 sm:px-8">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-brand-700">
              <Sparkles size={14} />知识库搜索
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">从可访问的知识中找到答案</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">搜索文档标题和正文，快速定位制度、手册、项目资料与最新更新。</p>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <label className="sr-only" htmlFor="search-landing-input">搜索关键词</label>
                <input
                  autoComplete="off"
                  className="h-12 w-full rounded-lg border border-slate-300 bg-white pl-11 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  id="search-landing-input"
                  placeholder="输入文档标题或内容关键词"
                  value={inputValue}
                  onChange={(event) => onInputChange(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") onSubmit(); }}
                />
              </div>
              <button
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-600 px-7 text-sm font-medium text-white transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                onClick={onSubmit}
                type="button"
              >
                <Search size={16} />搜索
              </button>
            </div>

            {onAdvancedSearch && (
              <button
                aria-expanded={advancedOpen}
                className="mt-3 inline-flex min-h-8 items-center gap-1 text-xs font-medium text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                onClick={onAdvancedSearch}
                type="button"
              >
                {advancedOpen ? "收起筛选与检索模式" : "打开筛选与检索模式"}
                <ArrowRight className={advancedOpen ? "rotate-90" : ""} size={13} />
              </button>
            )}
          </div>

          {/* 常用知识库快捷入口：点击按知识库缩放检索 */}
          {(knowledgeBasesLoading || knowledgeBases.length > 0 || knowledgeBasesError) && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-3 sm:px-8">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <BookOpen size={14} className="text-brand-600" />常用知识库
              </span>
              {knowledgeBasesLoading ? (
                <span className="flex gap-2">
                  {[1, 2, 3].map((n) => <span key={n} className="h-7 w-24 animate-pulse rounded-lg bg-slate-200 motion-reduce:animate-none" />)}
                </span>
              ) : knowledgeBasesError ? (
                <span className="text-xs text-slate-400">{knowledgeBasesError}</span>
              ) : (
                knowledgeBases.slice(0, 8).map((item) => (
                  <button
                    key={item.id}
                    className="group inline-flex h-7 max-w-[180px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    onClick={() => onKnowledgeBaseSelect?.(item)}
                    title={item.name}
                    type="button"
                  >
                    <FolderOpen size={13} className="shrink-0 text-slate-400 transition group-hover:text-brand-500" />
                    <span className="truncate">{item.name}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </section>

        {filtersContent}

        {/* 单一栅格：主列（最近更新）+ 右栏（热门搜索 / 搜索历史），列边对齐 */}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
          <section aria-labelledby="recent-documents-title" className="rounded-xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900" id="recent-documents-title">最近更新</h2>
                <p className="mt-1 text-xs text-slate-500">来自真实文档数据</p>
              </div>
              <Clock3 className="text-brand-600" size={18} />
            </div>
            {recentDocumentsLoading ? (
              <LoadingRows />
            ) : recentDocumentsError ? (
              <EmptyInline text={recentDocumentsError} />
            ) : recentDocuments.length === 0 ? (
              <EmptyInline text="暂无最近更新" />
            ) : (
              <div className="divide-y divide-slate-100">
                {recentDocuments.map((item) => (
                  <button
                    className="flex min-h-16 w-full items-center gap-3 py-3 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    key={item.id}
                    onClick={() => onRecentDocumentSelect?.(item)}
                    type="button"
                  >
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white ${fileBadgeTone(item.fileType || "FILE")}`}>
                      {item.fileType && item.fileType !== "FILE" ? fileBadgeText(item.fileType) : <FileText size={17} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{item.title}</span>
                      <span className="mt-1 block truncate text-xs text-slate-500">
                        {item.path || "未设置路径"}{item.fileType && ` · ${item.fileType}`}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-xs text-slate-500">{formatDate(item.updatedAt)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="space-y-6">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
              <HotSearchPanel id="hot-search" items={hotItems} activeRange={hotRange} loading={hotLoading} onRangeChange={onHotRangeChange} onSelect={onHotSelect} />
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
              <SearchHistoryPanel id="search-history" items={historyItems} onSelect={onHistorySelect} onDelete={onHistoryDelete} onClear={onHistoryClear} />
            </section>
            {recommendedCategories.length > 0 && (
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
                <h2 className="text-sm font-semibold text-slate-900">推荐入口</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {recommendedCategories.map((item) => (
                    <button
                      className={cn(
                        "min-h-8 rounded-lg border px-3 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                        selectedCategoryId === item.id ? "border-brand-200 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-700 hover:bg-slate-50",
                      )}
                      key={`${item.target}-${item.id}`}
                      onClick={() => onCategorySelect?.(item)}
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function LoadingRows() { return <div aria-busy="true" className="space-y-3 pt-4">{[1, 2, 3].map((item) => <div className="flex animate-pulse gap-3 motion-reduce:animate-none" key={item}><div className="h-10 w-10 rounded bg-slate-200" /><div className="flex-1 space-y-2"><div className="h-3 w-3/5 rounded bg-slate-200" /><div className="h-3 w-4/5 rounded bg-slate-100" /></div></div>)}</div>; }
function EmptyInline({ text }: { text: string }) { return <div className="flex min-h-28 items-center justify-center text-xs text-slate-500">{text}</div>; }
function formatDate(value?: string) { return value ? new Date(value).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }) : "—"; }
