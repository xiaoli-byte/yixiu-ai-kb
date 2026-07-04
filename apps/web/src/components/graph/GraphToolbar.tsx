"use client";

import { Download, Loader2, RotateCcw, Search } from "lucide-react";
import type { GraphCategory, GraphExploreQuery } from "@/types/api";

interface GraphToolbarProps {
  filters: GraphExploreQuery;
  categories: GraphCategory[];
  loading?: boolean;
  onChange: (patch: Partial<GraphExploreQuery>) => void;
  onSearch: () => void;
  onReset: () => void;
  onExport: () => void;
}

const nodeTypeOptions = [
  { value: "all", label: "全部" },
  { value: "Document", label: "文档" },
  { value: "Entity", label: "知识点" },
  { value: "Tag", label: "标签" },
] as const;

export function GraphToolbar({
  filters,
  categories,
  loading,
  onChange,
  onSearch,
  onReset,
  onExport,
}: GraphToolbarProps) {
  return (
    <section className="rounded-lg border border-slate-200/80 bg-white p-3 shadow-soft">
      <div className="grid gap-3 xl:grid-cols-[minmax(220px,1.4fr)_150px_170px_260px_auto_auto] lg:grid-cols-3 md:grid-cols-2">
        <div className="relative min-w-0">
          <Search
            size={17}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input h-10 pl-9"
            placeholder="请输入关键词搜索图谱..."
            value={filters.keyword || ""}
            onChange={(event) => onChange({ keyword: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSearch();
            }}
          />
        </div>

        <select
          className="input h-10"
          value={filters.nodeType || "all"}
          onChange={(event) =>
            onChange({ nodeType: event.target.value as GraphExploreQuery["nodeType"] })
          }
          aria-label="节点类型"
        >
          {nodeTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              节点类型：{option.label}
            </option>
          ))}
        </select>

        <select
          className="input h-10"
          value={filters.categoryId || ""}
          onChange={(event) => onChange({ categoryId: event.target.value || undefined })}
          aria-label="业务分类"
        >
          <option value="">业务分类：全部</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-2">
          <input
            className="input h-10"
            type="date"
            value={filters.createdFrom || ""}
            onChange={(event) => onChange({ createdFrom: event.target.value || undefined })}
            aria-label="创建开始日期"
          />
          <input
            className="input h-10"
            type="date"
            value={filters.createdTo || ""}
            onChange={(event) => onChange({ createdTo: event.target.value || undefined })}
            aria-label="创建结束日期"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <select
            className="input h-10"
            value={filters.depth || 2}
            onChange={(event) => onChange({ depth: Number(event.target.value) })}
            aria-label="关系深度"
          >
            <option value={1}>深度 1</option>
            <option value={2}>深度 2</option>
            <option value={3}>深度 3</option>
          </select>
          <button className="btn-ghost h-10 border border-slate-200" onClick={onReset} type="button">
            <RotateCcw size={15} />
            重置
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary h-10" onClick={onSearch} disabled={loading} type="button">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            搜索
          </button>
          <button className="btn-ghost h-10 border border-slate-200" onClick={onExport} type="button">
            <Download size={15} />
            导出
          </button>
        </div>
      </div>
    </section>
  );
}
