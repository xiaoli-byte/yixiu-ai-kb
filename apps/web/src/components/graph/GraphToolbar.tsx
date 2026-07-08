"use client";

import {
  Calendar,
  Download,
  FileJson,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Search,
} from "lucide-react";
import type { GraphExploreQuery, GraphFilterOptions } from "@/types/api";

export type GraphExportFormat = "png" | "svg" | "json";

interface GraphToolbarProps {
  filters: GraphExploreQuery;
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

const exportOptions = [
  { format: "png", label: "PNG", Icon: ImageIcon },
  { format: "svg", label: "SVG", Icon: Download },
  { format: "json", label: "JSON", Icon: FileJson },
] as const;

export function GraphToolbar({
  filters,
  filterOptions,
  loading,
  onChange,
  onSearch,
  onReset,
  onExport,
}: GraphToolbarProps) {
  return (
    <section className="rounded-lg border border-slate-200/80 bg-white p-3 shadow-soft">
      <div className="flex flex-wrap items-center gap-1.5" data-filter-row="graph">
        <div className="relative min-w-[190px] flex-[1_1_190px]">
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
          className="input h-10 min-w-[108px] flex-[0_1_108px]"
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
          className="input h-10 min-w-[118px] flex-[0_1_118px]"
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
          className="input h-10 min-w-[136px] flex-[0_1_136px]"
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

        <DateRange
          className="min-w-[268px] flex-[1_1_268px]"
          from={filters.createdFrom}
          to={filters.createdTo}
          fromLabel="创建开始"
          toLabel="创建结束"
          rangeLabel="创建时间范围"
          onFrom={(value) => onChange({ createdFrom: value || undefined })}
          onTo={(value) => onChange({ createdTo: value || undefined })}
        />
        <div className="grid min-w-[162px] flex-none grid-cols-2 gap-2">
          <button className="btn-primary h-10" onClick={onSearch} disabled={loading} type="button">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            搜索
          </button>
          <button className="btn-ghost h-10 border border-slate-200" onClick={onReset} type="button">
            <RotateCcw size={15} />
            重置
          </button>
        </div>
      </div>

      <div
        className="mt-3 flex justify-end border-t border-slate-100 pt-3"
        data-export-row="graph"
      >
        <div className="relative">
          <details className="group relative">
            <summary
              className="btn-ghost h-10 cursor-pointer list-none border border-slate-200 px-3 [&::-webkit-details-marker]:hidden"
              aria-label="导出图谱"
              aria-haspopup="menu"
              data-export-trigger="graph"
              title="导出图谱"
            >
              <Download size={15} />
              <span className="text-sm">导出图谱</span>
            </summary>
            <div
              className="absolute right-0 z-20 mt-2 w-36 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
              role="menu"
            >
              {exportOptions.map(({ format, label, Icon }) => (
                <button
                  key={format}
                  className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-slate-700 hover:bg-slate-100"
                  data-export-format={format}
                  onClick={(event) => {
                    event.currentTarget.closest("details")?.removeAttribute("open");
                    void onExport(format);
                  }}
                  role="menuitem"
                  title={`导出 ${label}`}
                  type="button"
                >
                  <Icon size={15} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </details>
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
  rangeLabel,
  className,
  onFrom,
  onTo,
}: {
  from?: string;
  to?: string;
  fromLabel: string;
  toLabel: string;
  rangeLabel: string;
  className?: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
}) {
  return (
    <div
      className={[
        "flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm transition focus-within:border-brand-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-brand-500/30",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={rangeLabel}
      data-date-range="created"
      role="group"
    >
      <Calendar size={15} className="shrink-0 text-slate-400" />
      <input
        className="min-w-0 flex-1 appearance-none bg-transparent text-sm text-slate-900 outline-none [color-scheme:light] [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
        type="date"
        value={from || ""}
        onChange={(event) => onFrom(event.target.value)}
        aria-label={fromLabel}
        title={fromLabel}
      />
      <span className="shrink-0 text-slate-300">至</span>
      <input
        className="min-w-0 flex-1 appearance-none bg-transparent text-sm text-slate-900 outline-none [color-scheme:light] [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
        type="date"
        value={to || ""}
        onChange={(event) => onTo(event.target.value)}
        aria-label={toLabel}
        title={toLabel}
      />
    </div>
  );
}

