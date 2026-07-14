import { SlidersHorizontal, X } from "lucide-react";
import type { DocumentPermissionScope } from "@/types/api";
import type { SearchListQuery, SearchMode } from "@/services/search";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/Select";

export type SearchFiltersValue = Pick<SearchListQuery, "fileType" | "categoryId" | "permissionScope" | "updateTimeRange"> & {
  knowledgeBaseId?: string;
  folderId?: string;
};

export interface SearchFilterOption { value: string; label: string; }

interface SearchFiltersProps {
  id?: string;
  value: SearchFiltersValue;
  expanded: boolean;
  onChange: (next: Partial<SearchFiltersValue>) => void;
  onClear: () => void;
  onToggleExpanded: () => void;
  knowledgeBases?: SearchFilterOption[];
  folders?: SearchFilterOption[];
  mode?: SearchMode;
  onModeChange?: (mode: SearchMode) => void;
  showPermission?: boolean;
}

const FILE_TYPES: SearchFilterOption[] = [
  { value: "", label: "全部类型" }, { value: "pdf", label: "PDF" }, { value: "docx", label: "DOCX" },
  { value: "xlsx", label: "XLSX" }, { value: "pptx", label: "PPTX" }, { value: "txt", label: "TXT" },
];
const UPDATE_TIMES: SearchFilterOption[] = [
  { value: "", label: "全部时间" }, { value: "today", label: "今天" }, { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
];
const PERMISSIONS: Array<SearchFilterOption & { value: DocumentPermissionScope | "" }> = [
  { value: "", label: "全部权限" }, { value: "PRIVATE", label: "仅本人可见" }, { value: "MEMBERS", label: "指定成员可见" },
  { value: "DEPARTMENTS", label: "部门可见" }, { value: "COMPANY", label: "公司可见" }, { value: "PUBLIC", label: "公开可见" },
];
const MODES: Array<{ value: SearchMode; label: string; help: string }> = [
  { value: "hybrid", label: "混合检索", help: "结合关键词与语义" }, { value: "keyword", label: "关键词", help: "匹配标题和正文" }, { value: "semantic", label: "语义检索", help: "按内容含义匹配" },
];

export function SearchFilters({ id, value, expanded, onChange, onClear, onToggleExpanded, knowledgeBases = [], folders = [], mode, onModeChange, showPermission = true }: SearchFiltersProps) {
  const hasFilter = Object.values(value).some(isMeaningfulFilterValue);
  return (
    <div className="scroll-mt-4 bg-white px-4 py-3 sm:px-8" id={id}>
      <div className="flex flex-wrap items-center gap-2">
        {knowledgeBases.length > 0 && <FilterSelect label="知识库" value={value.categoryId ?? ""} options={[{ value: "", label: "全部" }, ...knowledgeBases]} onChange={(categoryId) => onChange({ categoryId: categoryId || undefined })} />}
        {folders.length > 0 && <FilterSelect label="文件夹" value={value.folderId ?? ""} options={[{ value: "", label: "全部" }, ...folders]} onChange={(folderId) => onChange({ folderId: folderId || undefined })} />}
        <FilterSelect label="文件类型" value={value.fileType ?? ""} options={FILE_TYPES} onChange={(fileType) => onChange({ fileType: fileType || undefined })} />
        <FilterSelect label="更新时间" value={value.updateTimeRange ?? ""} options={UPDATE_TIMES} onChange={(updateTimeRange) => onChange({ updateTimeRange: (updateTimeRange || undefined) as SearchFiltersValue["updateTimeRange"] })} />
        {showPermission && <FilterSelect label="权限范围" value={value.permissionScope ?? ""} options={PERMISSIONS} onChange={(permissionScope) => onChange({ permissionScope: (permissionScope || undefined) as DocumentPermissionScope | undefined })} />}
        {(onModeChange || mode) && <FilterSelect label="检索模式" value={mode ?? "hybrid"} options={MODES.map(({ value: optionValue, label }) => ({ value: optionValue, label }))} onChange={(next) => onModeChange?.(next as SearchMode)} />}
        <span className="ml-auto inline-flex items-center gap-1">
          <button aria-label="清除筛选" className="inline-flex h-10 items-center gap-1 rounded-lg px-3 text-xs text-brand-600 hover:bg-brand-50 disabled:text-slate-400 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" disabled={!hasFilter} onClick={onClear} type="button"><X size={13} />清空</button>
          <button aria-expanded={expanded} className={cn("inline-flex h-10 items-center gap-1 rounded-lg px-3 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500", expanded ? "bg-brand-50 text-brand-700" : "text-brand-600 hover:bg-brand-50")} onClick={onToggleExpanded} type="button"><SlidersHorizontal size={13} />{expanded ? "收起" : "展开"}</button>
        </span>
      </div>
      {expanded && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"><div className="mb-2 font-medium text-slate-800">检索模式说明</div><div className="grid gap-2 sm:grid-cols-3">{MODES.map((item) => <button key={item.value} className={cn("rounded-lg border bg-white p-2 text-left hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500", mode === item.value && "border-brand-300 bg-brand-50")} onClick={() => onModeChange?.(item.value)} type="button"><span className="block font-medium text-slate-800">{item.label}</span><span className="mt-1 block text-slate-500">{item.help}</span></button>)}</div></div>}
    </div>
  );
}

function isMeaningfulFilterValue(value: unknown) { return Boolean(value && value !== "all"); }

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: SearchFilterOption[]; onChange: (value: string) => void }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="text-xs text-slate-500">{label}:</span>
      <Select ariaLabel={label} size="md" value={value} options={options} onChange={onChange} triggerWidthClassName="max-w-[14rem]" />
    </span>
  );
}
