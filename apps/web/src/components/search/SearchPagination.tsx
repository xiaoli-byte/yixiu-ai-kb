import { ChevronLeft, ChevronRight } from "lucide-react";

interface SearchPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  truncated?: boolean;
  onPageChange: (page: number) => void;
}

export function SearchPagination({ page, pageSize, total, truncated = false, onPageChange }: SearchPaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, total);

  return (
    <nav aria-label="搜索结果分页" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-4 sm:px-8">
      <p className="text-xs text-slate-500">
        显示第 {start}–{end} 条，{truncated ? `当前可浏览 ${total} 条（结果已截断）` : `共 ${total} 条`}
      </p>
      <div className="flex items-center gap-1">
        <button
          aria-label="上一页"
          className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          type="button"
        >
          <ChevronLeft size={16} />
        </button>
        <span aria-current="page" className="grid h-10 min-w-10 place-items-center rounded-lg bg-brand-50 px-3 text-xs font-medium text-brand-700 tabular">
          {currentPage} / {pageCount}
        </span>
        <button
          aria-label="下一页"
          className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          disabled={currentPage >= pageCount}
          onClick={() => onPageChange(currentPage + 1)}
          type="button"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}
