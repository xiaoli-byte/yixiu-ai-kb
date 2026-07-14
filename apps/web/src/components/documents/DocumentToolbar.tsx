"use client";

import { useMemo } from "react";
import { RefreshCw, Search, SlidersHorizontal, Upload, X } from "lucide-react";
import type { DocumentPermissionScope, DocumentStatus } from "@/services/documents";
import { cn } from "@/lib/utils";
import { useUsers } from "@/hooks/useUsers";
import { useDepartments } from "@/hooks/useDepartments";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Select } from "@/components/ui/Select";
import { DateRangeField } from "@/components/ui/DateRangeField";
import { EditorOrAbove } from "@/components/PermissionGate";

interface DocumentToolbarProps {
  query: string;
  fileType: string;
  status: DocumentStatus | "";
  permissionScope: DocumentPermissionScope | "";
  uploaderId: string;
  departmentId: string;
  uploadedFrom: string;
  uploadedTo: string;
  moreOpen: boolean;
  loading?: boolean;
  uploading?: boolean;
  onQueryChange: (query: string) => void;
  onFileTypeChange: (fileType: string) => void;
  onStatusChange: (status: DocumentStatus | "") => void;
  onPermissionScopeChange: (scope: DocumentPermissionScope | "") => void;
  onUploaderIdChange: (uploaderId: string) => void;
  onDepartmentIdChange: (departmentId: string) => void;
  onUploadedFromChange: (uploadedFrom: string) => void;
  onUploadedToChange: (uploadedTo: string) => void;
  onToggleMore: () => void;
  onClearFilters: () => void;
  onUploadClick: () => void;
  onRefresh: () => void;
}

const FILE_TYPES = [
  { value: "", label: "全部类型" },
  { value: "pdf", label: "PDF" },
  { value: "word", label: "DOCX" },
  { value: "excel", label: "XLSX" },
  { value: "presentation", label: "PPTX" },
  { value: "text", label: "TXT" },
];

const STATUSES: Array<{ value: DocumentStatus | ""; label: string }> = [
  { value: "", label: "全部状态" },
  { value: "PENDING", label: "待解析" },
  { value: "PARSING", label: "解析中" },
  { value: "CHUNKING", label: "切分中" },
  { value: "EMBEDDING", label: "向量化" },
  { value: "READY", label: "解析完成" },
  { value: "FAILED", label: "解析失败" },
];

const PERMISSIONS: Array<{ value: DocumentPermissionScope | ""; label: string }> = [
  { value: "", label: "全部权限" },
  { value: "PRIVATE", label: "仅本人可见" },
  { value: "MEMBERS", label: "指定成员可见" },
  { value: "DEPARTMENTS", label: "部门可见" },
  { value: "COMPANY", label: "公司可见" },
  { value: "PUBLIC", label: "公开可见" },
  { value: "ADMIN", label: "管理员可见" },
];

export function DocumentToolbar({
  query,
  fileType,
  status,
  permissionScope,
  uploaderId,
  departmentId,
  uploadedFrom,
  uploadedTo,
  moreOpen,
  loading,
  uploading,
  onQueryChange,
  onFileTypeChange,
  onStatusChange,
  onPermissionScopeChange,
  onUploaderIdChange,
  onDepartmentIdChange,
  onUploadedFromChange,
  onUploadedToChange,
  onToggleMore,
  onClearFilters,
  onUploadClick,
  onRefresh,
}: DocumentToolbarProps) {
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: departments, isLoading: departmentsLoading } = useDepartments();

  const userOptions = useMemo(
    () =>
      (users || []).map((u) => ({
        value: u.id,
        label: u.email ? `${u.name}（${u.email}）` : u.name,
      })),
    [users],
  );
  const departmentOptions = useMemo(
    () => (departments || []).map((d) => ({ value: d.id, label: d.name })),
    [departments],
  );

  const hasFilters = Boolean(
    query ||
      fileType ||
      status ||
      permissionScope ||
      uploaderId ||
      departmentId ||
      uploadedFrom ||
      uploadedTo,
  );

  return (
    <div className="border-b border-slate-200 bg-white px-6 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative h-8 w-64 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="h-8 w-full rounded border border-slate-200 bg-white pl-9 pr-8 text-[13px] outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            placeholder="搜索文档名称..."
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          {query && (
            <button
              className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-slate-400 hover:bg-slate-100"
              onClick={() => onQueryChange("")}
              title="清空搜索"
              type="button"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <ToolbarSelect label="文件类型" value={fileType} options={FILE_TYPES} onChange={onFileTypeChange} />
        <ToolbarSelect
          label="解析状态"
          value={status}
          options={STATUSES}
          onChange={(value) => onStatusChange(value as DocumentStatus | "")}
        />
        <ToolbarSelect
          label="权限范围"
          value={permissionScope}
          options={PERMISSIONS}
          onChange={(value) => onPermissionScopeChange(value as DocumentPermissionScope | "")}
        />
        <button
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded border px-3 text-xs transition",
            moreOpen
              ? "border-brand-200 bg-brand-50 text-brand-700"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
          )}
          onClick={onToggleMore}
          type="button"
        >
          <SlidersHorizontal size={13} />
          更多筛选
        </button>
        <button
          className="inline-flex h-8 items-center gap-1 rounded px-2 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          disabled={!hasFilters}
          onClick={onClearFilters}
          type="button"
        >
          <X size={13} />
          清空
        </button>
        <div className="ml-auto flex items-center gap-2">
          {/* 批量上传是写操作，仅 editor 及以上角色可见（viewer 隐藏） */}
          <EditorOrAbove hidden>
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded bg-brand-600 px-3 text-[13px] font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
              disabled={uploading}
              onClick={onUploadClick}
              type="button"
            >
              <Upload size={14} />
              批量上传
            </button>
          </EditorOrAbove>
          <button
            className="grid h-8 w-8 place-items-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
            disabled={loading}
            onClick={onRefresh}
            title="刷新"
            type="button"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
      {moreOpen && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded bg-slate-50 p-3 text-xs text-slate-500">
          <span className="font-medium text-slate-700">更多筛选</span>
          <SearchableSelect
            placeholder="上传人"
            value={uploaderId}
            options={userOptions}
            loading={usersLoading}
            onChange={onUploaderIdChange}
          />
          <SearchableSelect
            placeholder="所属部门"
            value={departmentId}
            options={departmentOptions}
            loading={departmentsLoading}
            onChange={onDepartmentIdChange}
          />
          <div className="flex items-center gap-1">
            <span>上传时间</span>
            <DateRangeField
              ariaLabel="上传时间范围"
              placeholder="选择日期范围"
              from={uploadedFrom}
              to={uploadedTo}
              onChange={({ from, to }) => {
                onUploadedFromChange(from);
                onUploadedToChange(to);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ToolbarSelect({
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
  return <Select ariaLabel={label} size="sm" value={value} options={options} onChange={onChange} />;
}
