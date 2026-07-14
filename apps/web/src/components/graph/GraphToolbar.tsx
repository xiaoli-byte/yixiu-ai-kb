"use client";

import {
  Download,
  FileJson,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Search,
} from "lucide-react";
import type { GraphExploreQuery, GraphFilterOptions } from "@/types/api";
import { Select } from "@/components/ui/Select";
import { DateRangeField } from "@/components/ui/DateRangeField";

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
    <section className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-card">
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

        <span className="flex min-w-[150px] flex-[0_1_160px] items-center gap-1.5">
          <span aria-hidden="true" className="whitespace-nowrap text-xs text-slate-500">节点类型:</span>
          <Select
            className="min-w-0 flex-1"
            triggerClassName="h-10"
            triggerWidthClassName="w-full"
            ariaLabel="节点类型"
            value={filters.nodeType || "all"}
            options={nodeTypeOptions.map((option) => ({ value: option.value, label: option.label }))}
            onChange={(value) => onChange({ nodeType: value as GraphExploreQuery["nodeType"] })}
          />
        </span>

        <span className="flex min-w-[140px] flex-[0_1_150px] items-center gap-1.5">
          <span aria-hidden="true" className="whitespace-nowrap text-xs text-slate-500">文档:</span>
          <Select
            className="min-w-0 flex-1"
            triggerClassName="h-10"
            triggerWidthClassName="w-full"
            ariaLabel="文档"
            searchable
            value={filters.documentId || ""}
            options={[
              { value: "", label: "全部" },
              ...filterOptions.documents.map((document) => ({ value: document.id, label: document.title })),
            ]}
            onChange={(value) => onChange({ documentId: value || undefined })}
          />
        </span>

        <span className="flex min-w-[160px] flex-[0_1_170px] items-center gap-1.5">
          <span aria-hidden="true" className="whitespace-nowrap text-xs text-slate-500">关系类型:</span>
          <Select
            className="min-w-0 flex-1"
            triggerClassName="h-10"
            triggerWidthClassName="w-full"
            ariaLabel="关系类型"
            value={filters.relationType || ""}
            options={[
              { value: "", label: "全部" },
              ...filterOptions.relationTypes.map((type) => ({ value: type, label: type })),
            ]}
            onChange={(value) => onChange({ relationType: value || undefined })}
          />
        </span>

        <div className="flex min-w-[300px] flex-[1_1_300px] items-center gap-1.5" data-date-range="created">
          <span aria-hidden="true" className="whitespace-nowrap text-xs text-slate-500">创建时间:</span>
          <DateRangeField
            className="min-w-0 flex-1"
            triggerClassName="h-10 w-full"
            ariaLabel="创建时间范围"
            from={filters.createdFrom || ""}
            to={filters.createdTo || ""}
            onChange={({ from, to }) =>
              onChange({ createdFrom: from || undefined, createdTo: to || undefined })
            }
          />
        </div>
        <div className="grid min-w-[162px] flex-none grid-cols-2 gap-2">
          <button className="btn-ghost h-10 border border-slate-200" onClick={onReset} type="button">
            <RotateCcw size={15} />
            重置
          </button>
          <button className="btn-primary h-10" onClick={onSearch} disabled={loading} type="button">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            搜索
          </button>
        </div>

        <div className="ml-auto" data-export-row="graph">
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
              className="absolute right-0 z-20 mt-2 w-36 rounded-xl border border-slate-200 bg-white p-1 shadow-raised"
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

