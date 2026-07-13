import { AlertCircle, FileSearch, Loader2, RefreshCw } from "lucide-react";

export function SearchLoadingSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div aria-label="正在加载搜索结果" aria-busy="true" className="space-y-3 bg-white px-4 py-5 sm:px-8">
      {Array.from({ length: count }, (_, index) => (
        <div className="flex animate-pulse gap-3 rounded border border-slate-100 p-4 motion-reduce:animate-none" key={index}>
          <div className="h-10 w-10 shrink-0 rounded bg-slate-200" />
          <div className="min-w-0 flex-1 space-y-2"><div className="h-4 w-2/5 rounded bg-slate-200" /><div className="h-3 w-4/5 rounded bg-slate-100" /><div className="h-3 w-1/3 rounded bg-slate-100" /></div>
        </div>
      ))}
    </div>
  );
}

export function SearchEmptyState({ filtered = false, onClear }: { filtered?: boolean; onClear?: () => void }) {
  return (
    <section aria-label="搜索结果为空" className="mx-4 my-8 rounded border border-slate-200 bg-slate-50 px-6 py-12 text-center sm:mx-8">
      <FileSearch className="mx-auto text-slate-400" size={28} />
      <h2 className="mt-3 text-sm font-semibold text-slate-900">{filtered ? "没有找到匹配结果" : "请输入关键词开始搜索"}</h2>
      <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">{filtered ? "尝试更换关键词，或放宽已选条件。" : "支持按标题和正文内容查找可访问的知识库文档。"}</p>
      {filtered && onClear && <button className="mt-4 inline-flex h-10 items-center rounded border border-slate-200 bg-white px-4 text-xs font-medium text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" onClick={onClear} type="button">清除筛选</button>}
    </section>
  );
}

export function SearchErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <section aria-label="搜索失败" className="mx-4 my-8 rounded border border-rose-200 bg-rose-50 px-6 py-8 sm:mx-8">
      <div className="flex items-start gap-3"><AlertCircle className="mt-0.5 shrink-0 text-rose-600" size={18} /><div><h2 className="text-sm font-semibold text-rose-800">搜索暂时失败</h2><p className="mt-1 text-xs text-rose-700">{message || "请稍后重试。"}</p>{onRetry && <button className="mt-3 inline-flex h-10 items-center gap-1.5 rounded bg-white px-3 text-xs font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500" onClick={onRetry} type="button"><RefreshCw size={13} />重试</button>}</div></div>
    </section>
  );
}

export function SearchPartialState({ message = "部分内容暂时无法加载。" }: { message?: string }) {
  return <div role="status" className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"><Loader2 className="animate-spin motion-reduce:animate-none" size={14} />{message}</div>;
}
