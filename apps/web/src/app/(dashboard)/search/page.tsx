"use client";
import { useState } from "react";
import { Search, Loader2, FileText, Hash, Sparkles, AlertCircle, Clock } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import searchApi from "@/services/search";
import { cn } from "@/lib/utils";

interface SearchHit {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  idx: number;
  text: string;
  highlight: string;
  score: number;
  sources: string[];
}

const MODES = [
  { value: "hybrid", label: "混合检索", icon: Sparkles, desc: "BM25 + 向量 RRF 融合（推荐）" },
  { value: "semantic", label: "语义检索", icon: Hash, desc: "纯向量相似度" },
  { value: "keyword", label: "关键词检索", icon: FileText, desc: "PostgreSQL 全文索引" },
] as const;

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"hybrid" | "semantic" | "keyword">("hybrid");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [took, setTook] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);

  async function run() {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setRetryAfter(null);
    try {
      const res = await searchApi.search({ q, mode, topK: 10 });
      setHits(res.hits);
      setTook(res.took);
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
              onKeyDown={(e) => e.key === "Enter" && run()}
              autoFocus
            />
          </div>
          <button className="btn-primary" onClick={run} disabled={loading || !q.trim()}>
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