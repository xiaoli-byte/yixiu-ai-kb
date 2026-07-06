"use client";

import { Download, FileJson, Image, Loader2, RotateCcw, Search } from "lucide-react";
import type { ReactNode } from "react";
import type { GraphCategory, GraphExploreQuery, GraphFilterOptions } from "@/types/api";

export type GraphExportFormat = "png" | "svg" | "json";

interface GraphToolbarProps {
  filters: GraphExploreQuery;
  categories: GraphCategory[];
  filterOptions: GraphFilterOptions;
  loading?: boolean;
  onChange: (patch: Partial<GraphExploreQuery>) => void;
  onSearch: () => void;
  onReset: () => void;
  onExport: (format: GraphExportFormat) => void | Promise<void>;
}

const nodeTypeOptions = [
  { value: "all", label: "全部节点" },
  { value: "Document", label: "文档" },
  { value: "Entity", label: "知识点" },
  { value: "Tag", label: "标签" },
] as const;

export function GraphToolbar({
  filters,
  categories,
  filterOptions,
  loading,
  onChange,
  onSearch,
  onReset,
  onExport,
}: GraphToolbarProps) {
  return (
    <section className="rounded-lg border border-slate-200/80 bg-white p-3 shadow-soft">
      <div className="grid gap-3 2xl:grid-cols-[minmax(220px,1.3fr)_150px_170px_170px_170px_250px_auto] xl:grid-cols-4 lg:grid-cols-3 md:grid-cols-2">
        <div className="relative min-w-0">
          <Search
            size={17}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input h-10 pl-9"
            placeholder="搜索标题、实体、标签"
            value={filters.keyword || ""}
            onChange={(event) => onChange({ keyword: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSearch();
            }}
            aria-label="图谱关键词"
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
              {option.label}
            </option>
          ))}
        </select>

        <select
          className="input h-10"
          value={filters.categoryId || ""}
          onChange={(event) => onChange({ categoryId: event.target.value || undefined })}
          aria-label="业务分类"
        >
          <option value="">全部分类</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <select
          className="input h-10"
          value={filters.documentId || ""}
          onChange={(event) => onChange({ documentId: event.target.value || undefined })}
          aria-label="文档"
        >
          <option value="">全部文档</option>
          {filterOptions.documents.map((document) => (
            <option key={document.id} value={document.id}>
              {document.title}
            </option>
          ))}
        </select>

        <select
          className="input h-10"
          value={filters.entityType || ""}
          onChange={(event) => onChange({ entityType: event.target.value || undefined })}
          aria-label="实体类型"
        >
          <option value="">全部实体</option>
          {filterOptions.entityTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <select
          className="input h-10"
          value={filters.relationType || ""}
          onChange={(event) => onChange({ relationType: event.target.value || undefined })}
          aria-label="关系类型"
        >
          <option value="">全部关系</option>
          {filterOptions.relationTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

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
          <select
            className="input h-10"
            value={filters.limit || 80}
            onChange={(event) => onChange({ limit: Number(event.target.value) })}
            aria-label="节点上限"
          >
            <option value={40}>40 节点</option>
            <option value={80}>80 节点</option>
            <option value={120}>120 节点</option>
          </select>
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:grid-cols-2">
        <DateRange
          from={filters.createdFrom}
          to={filters.createdTo}
          fromLabel="创建开始"
          toLabel="创建结束"
          onFrom={(value) => onChange({ createdFrom: value || undefined })}
          onTo={(value) => onChange({ createdTo: value || undefined })}
        />
        <DateRange
          from={filters.updatedFrom}
          to={filters.updatedTo}
          fromLabel="更新开始"
          toLabel="更新结束"
          onFrom={(value) => onChange({ updatedFrom: value || undefined })}
          onTo={(value) => onChange({ updatedTo: value || undefined })}
        />
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary h-10" onClick={onSearch} disabled={loading} type="button">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            搜索
          </button>
          <button className="btn-ghost h-10 border border-slate-200" onClick={onReset} type="button">
            <RotateCcw size={15} />
            重置
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <ExportButton label="PNG" onClick={() => onExport("png")}>
            <Image size={15} />
          </ExportButton>
          <ExportButton label="SVG" onClick={() => onExport("svg")}>
            <Download size={15} />
          </ExportButton>
          <ExportButton label="JSON" onClick={() => onExport("json")}>
            <FileJson size={15} />
          </ExportButton>
        </div>
      </div>
    </section>
  );
}

function DateRange({
  from,
  to,
  fromLabel,
  toLabel,
  onFrom,
  onTo,
}: {
  from?: string;
  to?: string;
  fromLabel: string;
  toLabel: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <input
        className="input h-10"
        type="date"
        value={from || ""}
        onChange={(event) => onFrom(event.target.value)}
        aria-label={fromLabel}
        title={fromLabel}
      />
      <input
        className="input h-10"
        type="date"
        value={to || ""}
        onChange={(event) => onTo(event.target.value)}
        aria-label={toLabel}
        title={toLabel}
      />
    </div>
  );
}

function ExportButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="btn-ghost h-10 border border-slate-200 px-2"
      onClick={onClick}
      type="button"
      title={`导出 ${label}`}
    >
      {children}
      <span className="text-xs">{label}</span>
    </button>
  );
}
