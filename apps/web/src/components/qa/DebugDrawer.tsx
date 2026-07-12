"use client";
// RAG 调试抽屉：展示 qa_run_logs 运行记录
// 后端字段会逐步精简，facts/toolResult 可能为空数组/null，domain/intent 可能是通用值——
// 对不存在或空的字段直接不渲染，避免抽屉里出现一堆“（无）”占位。
import { useEffect, useState } from "react";
import { AlertTriangle, Bug, Loader2, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QaDebugRun } from "@/types/api";

// 判断字段是否有值得展示的内容
function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export interface DebugDrawerProps {
  open: boolean;
  runs: QaDebugRun[];
  loading: boolean;
  error: string | null;
  activeConversationId: string | null;
  onClose: () => void;
  onRefresh: () => void;
}

export function DebugDrawer({
  open,
  runs,
  loading,
  error,
  activeConversationId,
  onClose,
  onRefresh,
}: DebugDrawerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (runs.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !runs.some((run) => run.id === selectedId)) {
      setSelectedId(runs[0].id);
    }
  }, [open, runs, selectedId]);

  if (!open) return null;

  const selected = runs.find((run) => run.id === selectedId) || runs[0];
  const title = activeConversationId ? "当前会话调试" : "最近运行调试";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button className="absolute inset-0 bg-slate-900/20" aria-label="关闭调试面板" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-xl">
        <header className="h-14 shrink-0 border-b border-slate-200 px-4 flex items-center gap-3">
          <Bug size={16} className="text-brand-600" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800">{title}</div>
            <div className="text-xs text-slate-400 truncate">{activeConversationId || "未限定会话"}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="btn-ghost p-1.5" onClick={onRefresh} disabled={loading} title="刷新">
              <RefreshCw size={14} className={cn(loading && "animate-spin")} />
            </button>
            <button className="btn-ghost p-1.5" onClick={onClose} title="关闭">
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4">
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading && runs.length === 0 && (
            <div className="flex h-40 items-center justify-center text-sm text-slate-400">
              <Loader2 size={16} className="mr-2 animate-spin" />
              正在加载调试日志
            </div>
          )}

          {!loading && runs.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
              暂无 QA 运行日志
            </div>
          )}

          {runs.length > 0 && (
            <div className="space-y-4">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {runs.map((run) => (
                  <button
                    key={run.id}
                    className={cn(
                      "shrink-0 rounded-lg border px-3 py-2 text-left transition w-52 bg-white",
                      selected?.id === run.id
                        ? "border-brand-300 ring-2 ring-brand-100"
                        : "border-slate-200 hover:border-slate-300",
                    )}
                    onClick={() => setSelectedId(run.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", run.error ? "bg-red-500" : "bg-emerald-500")} />
                      <span className="text-xs font-medium text-slate-700">
                        {[run.domain, run.intent].filter(hasValue).join(" / ") || "未分类"}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-500">{run.question}</div>
                    <div className="mt-1 text-[11px] text-slate-400">{formatDebugTime(run.createdAt)}</div>
                  </button>
                ))}
              </div>

              {selected && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {hasValue(selected.domain) && <DebugField label="领域" value={selected.domain} />}
                    {hasValue(selected.intent) && <DebugField label="意图" value={selected.intent} />}
                    <DebugField
                      label="结构化事实"
                      value={`${Array.isArray(selected.facts) ? selected.facts.length : 0} 条`}
                    />
                    <DebugField
                      label="检索片段"
                      value={`${Array.isArray(selected.chunks) ? selected.chunks.length : 0} 条`}
                    />
                  </div>

                  <DebugSection title="原问题" value={selected.question} />
                  {hasValue(selected.rewrittenQuery) && (
                    <DebugSection title="改写问题" value={selected.rewrittenQuery} />
                  )}
                  {hasValue(selected.toolResult) && <DebugSection title="工具结果" value={selected.toolResult} />}
                  {hasValue(selected.facts) && <DebugSection title="结构化事实" value={selected.facts} />}
                  {hasValue(selected.chunks) && <DebugSection title="命中 Chunk" value={selected.chunks} />}
                  {selected.error ? (
                    <DebugSection title="错误" value={selected.error} tone="danger" />
                  ) : (
                    <DebugSection title="最终回答" value={selected.answer || "（无）"} />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function DebugField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}

function DebugSection({ title, value, tone }: { title: string; value: unknown; tone?: "danger" }) {
  const isPlainText = typeof value === "string";
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-3 py-2 text-xs font-medium text-slate-600">{title}</div>
      {isPlainText ? (
        <div
          className={cn(
            "max-h-48 overflow-auto whitespace-pre-wrap break-words px-3 py-2 text-xs leading-relaxed",
            tone === "danger" ? "text-red-700" : "text-slate-700",
          )}
        >
          {value}
        </div>
      ) : (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words bg-slate-950 px-3 py-2 text-xs leading-relaxed text-slate-100">
          {stringifyDebugValue(value)}
        </pre>
      )}
    </section>
  );
}

function stringifyDebugValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "（无）";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatDebugTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default DebugDrawer;
