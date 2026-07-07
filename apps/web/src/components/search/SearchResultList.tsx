import { Bookmark, Download, Eye, FileText } from "lucide-react";
import type { SearchHit } from "@/services/search";

interface SearchResultListProps {
  hits: SearchHit[];
  onView?: (hit: SearchHit) => void;
  onDownload?: (hit: SearchHit) => void;
  onFavorite?: (hit: SearchHit) => void;
}

interface ResultActionProps {
  hit: SearchHit;
  onView?: (hit: SearchHit) => void;
  onDownload?: (hit: SearchHit) => void;
  onFavorite?: (hit: SearchHit) => void;
}

export function SearchResultList({ hits, onView, onDownload, onFavorite }: SearchResultListProps) {
  return (
    <div className="bg-white px-8">
      {hits.map((hit) => (
        <article key={hit.chunkId} className="flex gap-4 border-b border-slate-200 py-4">
          <FileBadge hit={hit} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-medium text-slate-900">{hit.documentTitle}</h3>
            <p
              className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600"
              dangerouslySetInnerHTML={{ __html: hit.highlight || hit.text }}
            />
            <ResultMeta hit={hit} />
          </div>
          <ResultActions hit={hit} onView={onView} onDownload={onDownload} onFavorite={onFavorite} />
        </article>
      ))}
    </div>
  );
}

function FileBadge({ hit }: { hit: SearchHit }) {
  const type = getFileType(hit);
  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded bg-brand-600 text-[11px] font-semibold text-white">
      {type === "FILE" ? <FileText size={17} /> : type}
    </div>
  );
}

function ResultMeta({ hit }: { hit: SearchHit }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
      <span>{hit.categoryPath || "未分类"}</span>
      <span className="text-slate-300">|</span>
      <span>{formatDate(hit.updatedAt || hit.createdAt)} 更新</span>
      <span className="text-slate-300">|</span>
      <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-700">
        {permissionLabel(hit.permissionScope)}
      </span>
      <span className="text-slate-300">|</span>
      <span>{getFileType(hit)}</span>
    </div>
  );
}

function ResultActions({ hit, onView, onDownload, onFavorite }: ResultActionProps) {
  return (
    <div className="flex shrink-0 items-center gap-3">
      <button className="inline-flex items-center gap-1 text-xs text-brand-700" onClick={() => onView?.(hit)} type="button">
        <Eye size={14} />
        查看
      </button>
      {hit.canDownload !== false && (
        <button
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-700"
          onClick={() => onDownload?.(hit)}
          type="button"
        >
          <Download size={14} />
          下载
        </button>
      )}
      <button
        className="grid h-8 w-8 place-items-center rounded text-slate-400 hover:bg-slate-50 hover:text-brand-700"
        onClick={() => onFavorite?.(hit)}
        title="收藏"
        type="button"
      >
        <Bookmark size={15} />
      </button>
    </div>
  );
}

function getFileType(hit: SearchHit) {
  const raw = hit.mime || hit.documentTitle.split(".").pop() || "";
  const lower = raw.toLowerCase();
  if (lower.includes("pdf")) return "PDF";
  if (lower.includes("word") || lower.includes("doc")) return "DOCX";
  if (lower.includes("sheet") || lower.includes("excel") || lower.includes("xls")) return "XLSX";
  if (lower.includes("presentation") || lower.includes("ppt")) return "PPTX";
  if (lower.includes("text") || lower.includes("txt")) return "TXT";
  return "FILE";
}

function permissionLabel(scope?: string | null) {
  const map: Record<string, string> = {
    PRIVATE: "仅本人可见",
    MEMBERS: "指定成员可见",
    DEPARTMENTS: "部门可见",
    COMPANY: "公司可见",
    PUBLIC: "公开可见",
    ADMIN: "管理员可见",
  };
  return scope ? map[scope] || scope : "权限范围";
}

function formatDate(value?: string | null) {
  if (!value) return "未知时间";
  return new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}
