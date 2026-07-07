import { Bookmark, Download, Eye, FileText } from "lucide-react";
import type { SearchHit } from "@/services/search";

interface SearchResultGridProps {
  hits: SearchHit[];
  onView?: (hit: SearchHit) => void;
  onDownload?: (hit: SearchHit) => void;
  onFavorite?: (hit: SearchHit) => void;
}

export function SearchResultGrid({ hits, onView, onDownload, onFavorite }: SearchResultGridProps) {
  return (
    <div className="grid gap-3 bg-white px-8 py-3 md:grid-cols-2 xl:grid-cols-3">
      {hits.map((hit) => (
        <article key={hit.chunkId} className="rounded border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded bg-brand-600 text-[11px] font-semibold text-white">
              {getFileType(hit) === "FILE" ? <FileText size={16} /> : getFileType(hit)}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-sm font-medium leading-5 text-slate-900">{hit.documentTitle}</h3>
              <HighlightedSnippet
                className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600"
                highlight={hit.highlight}
                text={hit.text}
              />
            </div>
          </div>
          <div className="mt-3 space-y-1 text-xs text-slate-500">
            <div className="truncate">{hit.categoryPath || "未分类"}</div>
            <div className="flex items-center justify-between gap-2">
              <span>{formatDate(hit.updatedAt || hit.createdAt)} 更新</span>
              <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-700">
                {permissionLabel(hit.permissionScope)}
              </span>
            </div>
            <div>{getFileType(hit)}</div>
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
            <button className="inline-flex h-8 items-center gap-1 text-xs text-brand-700" onClick={() => onView?.(hit)} type="button">
              <Eye size={14} />
              查看
            </button>
            {hit.canDownload !== false && (
              <button
                className="inline-flex h-8 items-center gap-1 text-xs text-slate-500 hover:text-brand-700"
                onClick={() => onDownload?.(hit)}
                type="button"
              >
                <Download size={14} />
                下载
              </button>
            )}
            <button
              className="ml-auto grid h-8 w-8 place-items-center rounded text-slate-400 hover:bg-slate-50 hover:text-brand-700"
              onClick={() => onFavorite?.(hit)}
              title="收藏"
              type="button"
            >
              <Bookmark size={15} />
            </button>
          </div>
        </article>
      ))}
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

function HighlightedSnippet({
  className,
  highlight,
  text,
}: {
  className: string;
  highlight?: string | null;
  text: string;
}) {
  if (highlight?.trim()) {
    return <p className={className} dangerouslySetInnerHTML={{ __html: highlight }} />;
  }

  return <p className={className}>{text}</p>;
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
