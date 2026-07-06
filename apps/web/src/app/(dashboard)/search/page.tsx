"use client";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowUpDown, Clock, FileText, Hash, History, Loader2, Search, Sparkles, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import searchApi, { type SearchHit, type SearchHistoryItem, type SearchMode, type SearchRequest, type SearchSortBy } from "@/services/search";
import { cn } from "@/lib/utils";

const MODES = [
  { value: "hybrid", label: "混合检索", icon: Sparkles, desc: "BM25 + 向量 RRF 融合（推荐）" },
  { value: "semantic", label: "语义检索", icon: Hash, desc: "纯向量相似度" },
  { value: "keyword", label: "关键词检索", icon: FileText, desc: "PostgreSQL 全文索引" },
] as const;

const SORTS = [
  { value: "relevance", label: "按相关性" },
  { value: "time", label: "按时间" },
  { value: "name", label: "按名称" },
] as const;

const TOP_K_OPTIONS = [5, 10, 20, 50] as const;

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<SearchMode>("hybrid");
  const [sortBy, setSortBy] = useState<SearchSortBy>("relevance");
  const [topK, setTopK] = useState(10);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [took, setTook] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);

  useEffect(() => {
    void loadHistory();
  }, []);

  async function loadHistory() {
    try {
      const items = await searchApi.getSearchHistory({ limit: 20 });
      setHistory(items);
    } catch {
      setHistory([]);
    }
  }

  async function run(overrides: Partial<SearchRequest> = {}) {
    const nextQuery = (overrides.q ?? q).trim();
    if (!nextQuery) return;
    const nextMode = overrides.mode ?? mode;
    const nextSortBy = overrides.sortBy ?? sortBy;
    const nextTopK = overrides.topK ?? topK;

    setQ(nextQuery);
    setMode(nextMode);
    setSortBy(nextSortBy);
    setTopK(nextTopK);
    setLoading(true);
    setError(null);
    setRetryAfter(null);
    try {
      const res = await searchApi.search({ q: nextQuery, mode: nextMode, sortBy: nextSortBy, topK: nextTopK });
      setHits(res.hits);
      setTook(res.took);
      void loadHistory();
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.statusCode === 429) {
          setError("请求过于频繁，请稍后再试");
          setRetryAfter(e.retryAfter ?? null);
        } else {
          setError(e.message || "搜索失败");
        }
      } else {
        setError("网络错误，请重试");
      }
    } finally {
      setLoading(false);
    }
  }

  async function removeHistoryItem(id: string) {
    await searchApi.deleteSearchHistory(id);
    setHistory((items) => items.filter((item) => item.id !== id));
  }

  async function clearHistory() {
    await searchApi.clearSearchHistory();
    setHistory([]);
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">智能检索</h1>
        <p className="text-sm text-slate-500 mt-1">支持关键词、语义、混合三种检索模式</p>
      </div>

      <div className="card p-5 mb-5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              className="input pl-10"
              placeholder="输入问题或关键词，回车搜索"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void run();
              }}
              autoFocus
            />
          </div>
          <button className="btn-primary" onClick={() => void run()} disabled={loading || !q.trim()}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            搜索
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.value;
            return (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition",
                  active
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-200 hover:bg-slate-50 text-slate-600",
                )}
              >
                <Icon size={14} />
                <span className="font-medium">{m.label}</span>
                <span className="text-xs text-slate-400 hidden md:inline">· {m.desc}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-slate-600">
            <ArrowUpDown size={14} className="text-slate-400" />
            <select
              className="input h-9 w-36"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SearchSortBy)}
            >
              {SORTS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-slate-600">
            <Hash size={14} className="text-slate-400" />
            <select
              className="input h-9 w-28"
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
            >
              {TOP_K_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  Top {value}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* 限流错误提示 */}
      {error && (
        <div className="card p-4 mb-5 bg-amber-50 border-amber-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={18} />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">{error}</p>
              {retryAfter !== null && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <Clock size={12} />
                  {retryAfter > 0 ? `${retryAfter} 秒后可重试` : "可以重试了"}
                </p>
              )}
            </div>
            <button
              className="text-xs text-amber-600 hover:text-amber-800 underline"
              onClick={() => { setError(null); setRetryAfter(null); }}
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="card p-4 mb-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <History size={16} className="text-slate-400" />
              最近搜索
            </div>
            <button
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-rose-600"
              onClick={() => void clearHistory()}
              type="button"
            >
              <Trash2 size={12} />
              清空
            </button>
          </div>
          <div className="space-y-2">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
              >
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() =>
                    void run({
                      q: item.query,
                      mode: item.mode,
                      sortBy: item.sortBy,
                      topK: item.topK,
                    })
                  }
                  type="button"
                >
                  <div className="truncate text-sm font-medium text-slate-800">{item.query}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span>{MODES.find((m) => m.value === item.mode)?.label ?? item.mode}</span>
                    <span>{SORTS.find((s) => s.value === item.sortBy)?.label ?? item.sortBy}</span>
                    <span>Top {item.topK}</span>
                    <span>{item.resultCount} 条</span>
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                </button>
                <button
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  onClick={() => void removeHistoryItem(item.id)}
                  title="删除记录"
                  type="button"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {hits.length > 0 && (
        <div className="mb-3 text-xs text-slate-500">
          找到 {hits.length} 条结果 · 耗时 {took}ms
        </div>
      )}

      <div className="space-y-3">
        {hits.map((h, i) => (
          <div key={h.chunkId} className="card p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="badge bg-slate-100 text-slate-600">#{i + 1}</span>
                <span className="font-medium text-slate-800">{h.documentTitle}</span>
                <span className="text-xs text-slate-400">片段 #{h.idx}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {h.sources.includes("bm25") && (
                  <span className="badge bg-amber-50 text-amber-700">BM25</span>
                )}
                {h.sources.includes("vector") && (
                  <span className="badge bg-indigo-50 text-indigo-700">向量</span>
                )}
                <span className="text-slate-400">score {h.score.toFixed(4)}</span>
              </div>
            </div>
            <div
              className="text-sm text-slate-700 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: h.highlight }}
            />
          </div>
        ))}
        {!loading && hits.length === 0 && q && (
          <div className="card p-10 text-center text-slate-400">
            没有匹配的结果，试试其他关键词或切换检索模式
          </div>
        )}
      </div>
    </div>
  );
}
