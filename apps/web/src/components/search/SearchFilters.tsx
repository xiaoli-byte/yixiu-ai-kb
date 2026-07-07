import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import type { DocumentPermissionScope } from "@/types/api";
import type { SearchListQuery } from "@/services/search";
import { cn } from "@/lib/utils";

export type SearchFiltersValue = Pick<
  SearchListQuery,
  "fileType" | "categoryId" | "tagId" | "permissionScope" | "updateTimeRange"
>;

interface SearchFiltersProps {
  value: SearchFiltersValue;
  expanded: boolean;
  onChange: (next: Partial<SearchFiltersValue>) => void;
  onClear: () => void;
  onToggleExpanded: () => void;
}

const FILE_TYPES = [
  { value: "", label: "全部类型" },
  { value: "pdf", label: "PDF" },
  { value: "docx", label: "DOCX" },
  { value: "xlsx", label: "XLSX" },
  { value: "pptx", label: "PPTX" },
  { value: "txt", label: "TXT" },
];

const UPDATE_TIMES: Array<{ value: NonNullable<SearchFiltersValue["updateTimeRange"]> | ""; label: string }> = [
  { value: "", label: "全部时间" },
  { value: "today", label: "今天" },
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
  { value: "custom", label: "自定义" },
];

const CATEGORIES = [
  { value: "", label: "全部分类" },
  { value: "policy", label: "制度规范" },
  { value: "manual", label: "操作手册" },
  { value: "training", label: "培训资料" },
  { value: "project", label: "项目文档" },
  { value: "technical", label: "技术方案" },
];

const PERMISSIONS: Array<{ value: DocumentPermissionScope | ""; label: string }> = [
  { value: "", label: "全部权限" },
  { value: "PRIVATE", label: "仅本人可见" },
  { value: "MEMBERS", label: "指定成员可见" },
  { value: "DEPARTMENTS", label: "部门可见" },
  { value: "COMPANY", label: "公司可见" },
  { value: "PUBLIC", label: "公开可见" },
];

export function SearchFilters({
  value,
  expanded,
  onChange,
  onClear,
  onToggleExpanded,
}: SearchFiltersProps) {
  const hasFilter = Object.values(value).some(isMeaningfulFilterValue);

  return (
    <div className="border-b border-slate-200 bg-white px-8 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="文件类型"
          value={value.fileType ?? ""}
          options={FILE_TYPES}
          onChange={(fileType) => onChange({ fileType: fileType || undefined })}
        />
        <FilterSelect
          label="更新时间"
          value={value.updateTimeRange ?? ""}
          options={UPDATE_TIMES}
          onChange={(updateTimeRange) =>
            onChange({ updateTimeRange: (updateTimeRange || undefined) as SearchFiltersValue["updateTimeRange"] })
          }
        />
        <FilterSelect
          label="文档分类"
          value={value.categoryId ?? ""}
          options={CATEGORIES}
          onChange={(categoryId) => onChange({ categoryId: categoryId || undefined, tagId: undefined })}
        />
        <FilterSelect
          label="权限范围"
          value={value.permissionScope ?? ""}
          options={PERMISSIONS}
          onChange={(permissionScope) =>
            onChange({ permissionScope: (permissionScope || undefined) as DocumentPermissionScope | undefined })
          }
        />
        <button
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded border px-3 text-xs transition",
            expanded
              ? "border-brand-200 bg-brand-50 text-brand-700"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
          )}
          onClick={onToggleExpanded}
          type="button"
        >
          <SlidersHorizontal size={13} />
          高级搜索
        </button>
        <button
          className="inline-flex h-8 items-center gap-1 rounded px-3 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40"
          disabled={!hasFilter}
          onClick={onClear}
          type="button"
        >
          <X size={13} />
          清空筛选
        </button>
      </div>
      {expanded && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded bg-slate-50 p-3 text-xs text-slate-600">
          <span className="font-medium text-slate-800">更多筛选</span>
          <input
            className="h-8 w-36 rounded border border-slate-200 bg-white px-2 outline-none focus:border-brand-500"
            placeholder="标题包含"
            readOnly
          />
          <input
            className="h-8 w-36 rounded border border-slate-200 bg-white px-2 outline-none focus:border-brand-500"
            placeholder="正文包含"
            readOnly
          />
          <input
            className="h-8 w-32 rounded border border-slate-200 bg-white px-2 outline-none focus:border-brand-500"
            placeholder="上传人"
            readOnly
          />
          <span className="text-slate-400">高级条件将在后端字段就绪后启用</span>
        </div>
      )}
    </div>
  );
}

function isMeaningfulFilterValue(value: unknown) {
  return Boolean(value && value !== "all");
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative inline-flex h-8 items-center">
      <span className="sr-only">{label}</span>
      <select
        className="h-8 appearance-none rounded border border-slate-200 bg-white pl-3 pr-8 text-xs text-slate-800 outline-none transition hover:bg-slate-50 focus:border-brand-500"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-2 text-slate-400" />
    </label>
  );
}
