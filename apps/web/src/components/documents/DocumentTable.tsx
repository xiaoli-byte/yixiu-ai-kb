import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Edit2,
  Eye,
  File,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Loader2,
  Presentation,
  RotateCcw,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { DocumentDto } from "@/services/documents";
import { cn, formatBytes, statusColor, statusLabel } from "@/lib/utils";

interface DocumentTableProps {
  documents: DocumentDto[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onView: (doc: DocumentDto) => void;
  onDownload: (doc: DocumentDto) => void;
  onEdit: (doc: DocumentDto) => void;
  onDelete: (doc: DocumentDto) => void;
  onPermissions: (doc: DocumentDto) => void;
  onRetryParse: (doc: DocumentDto) => void;
  onRestore?: (doc: DocumentDto) => void;
  onPageChange: (page: number) => void;
  isArchive?: boolean;
}

export function DocumentTable({
  documents,
  total,
  page,
  pageSize,
  loading,
  selectedIds,
  onToggle,
  onToggleAll,
  onView,
  onDownload,
  onEdit,
  onDelete,
  onPermissions,
  onRetryParse,
  onRestore,
  onPageChange,
  isArchive = false,
}: DocumentTableProps) {
  const allSelected = documents.length > 0 && documents.every((doc) => selectedIds.includes(doc.id));
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const [goToPageInput, setGoToPageInput] = useState("");

  function submitPageJump() {
    const nextPage = Number.parseInt(goToPageInput, 10);
    if (!Number.isFinite(nextPage)) return;
    onPageChange(Math.min(pageCount, Math.max(1, nextPage)));
    setGoToPageInput("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[980px] border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-slate-50 text-slate-700">
            <tr className="h-10 border-b border-slate-200">
              <th className="w-11 px-4 text-left">
                <input
                  aria-label="选择全部文档"
                  checked={allSelected}
                  className="h-3.5 w-3.5 accent-brand-600"
                  onChange={onToggleAll}
                  type="checkbox"
                />
              </th>
              <th className="min-w-[240px] px-4 text-left font-medium">文档名称</th>
              <th className="w-24 px-4 text-left font-medium">文件类型</th>
              <th className="w-40 px-4 text-left font-medium">上传时间</th>
              <th className="w-32 px-4 text-left font-medium">上传人</th>
              <th className="w-32 px-4 text-left font-medium">解析状态</th>
              <th className="w-36 px-4 text-left font-medium">权限范围</th>
              <th className="w-44 px-4 text-left font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && documents.length === 0 ? (
              <tr>
                <td className="py-14 text-center text-slate-400" colSpan={8}>
                  <Loader2 className="mr-2 inline animate-spin" size={16} />
                  加载中
                </td>
              </tr>
            ) : documents.length === 0 ? (
              <tr>
                <td className="py-16 text-center text-slate-400" colSpan={8}>
                  <FileText className="mx-auto mb-2" size={28} />
                  暂无符合条件的文档
                </td>
              </tr>
            ) : (
              documents.map((doc) => (
                <tr key={doc.id} className="h-[58px] border-b border-slate-100 hover:bg-slate-50/70">
                  <td className="px-4">
                    <input
                      aria-label={`选择 ${doc.title}`}
                      checked={selectedIds.includes(doc.id)}
                      className="h-3.5 w-3.5 accent-brand-600"
                      onChange={() => onToggle(doc.id)}
                      type="checkbox"
                    />
                  </td>
                  <td className="px-4">
                    <div className="flex min-w-0 items-center gap-2">
                      {(() => {
                        const { Icon, bgClass, textClass } = getFileIcon(doc);
                        return (
                          <div
                            className={cn(
                              "grid h-8 w-8 shrink-0 place-items-center rounded ring-1",
                              bgClass,
                              textClass,
                            )}
                          >
                            <Icon size={16} />
                          </div>
                        );
                      })()}
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-900">{doc.title}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{formatBytes(doc.size)}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 text-xs text-slate-600">{getFileIcon(doc).label}</td>
                  <td className="px-4 text-xs text-slate-600">{formatDate(doc.createdAt)}</td>
                  <td className="px-4 text-xs text-slate-700">{doc.ownerName || "未知"}</td>
                  <td className="px-4">
                    <span className={cn("badge rounded px-2 py-0.5 ring-1 ring-inset", statusColor(doc.status))}>
                      {doc.status === "READY" ? (
                        <CheckCircle2 size={11} />
                      ) : doc.status === "FAILED" ? (
                        <AlertCircle size={11} />
                      ) : (
                        <Loader2 size={11} className="animate-spin" />
                      )}
                      {statusLabel(doc.status)}
                    </span>
                  </td>
                  <td className="px-4">
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                      {permissionLabel(doc.permissionScope)}
                    </span>
                  </td>
                  <td className="px-4">
                    <div className="flex items-center gap-1">
                      <IconButton icon={Eye} label="查看" onClick={() => onView(doc)} />
                      {doc.canDownload !== false && <IconButton icon={Download} label="下载" onClick={() => onDownload(doc)} />}
                      {isArchive ? (
                        onRestore ? <IconButton icon={RotateCcw} label="恢复" onClick={() => onRestore(doc)} /> : null
                      ) : doc.status === "FAILED" ? (
                        <IconButton icon={RotateCcw} label="重试解析" onClick={() => onRetryParse(doc)} />
                      ) : null}
                      {!isArchive && doc.canManagePermission !== false && (
                        <IconButton icon={ShieldCheck} label="权限设置" onClick={() => onPermissions(doc)} />
                      )}
                      {!isArchive && doc.canEdit !== false && <IconButton icon={Edit2} label="编辑" onClick={() => onEdit(doc)} />}
                      {doc.canDelete !== false && (
                        <IconButton className="text-rose-600 hover:bg-rose-50" icon={Trash2} label="删除" onClick={() => onDelete(doc)} />
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">
        <span>共 {total} 条 · 每页 {pageSize} 条</span>
        <div className="flex items-center gap-2">
          <button
            className="h-7 rounded border border-slate-200 px-2 text-slate-700 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            type="button"
          >
            上一页
          </button>
          <span>
            第 {page} / {pageCount} 页
          </span>
          <button
            className="h-7 rounded border border-slate-200 px-2 text-slate-700 disabled:opacity-40"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            type="button"
          >
            下一页
          </button>
          <label className="ml-2 inline-flex items-center gap-1">
            <span>跳转至</span>
            <input
              className="h-7 w-14 rounded border border-slate-200 px-2 text-slate-700 outline-none focus:border-brand-500"
              min={1}
              max={pageCount}
              type="number"
              value={goToPageInput}
              onChange={(event) => setGoToPageInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitPageJump();
              }}
            />
            <span>页</span>
          </label>
          <button
            className="h-7 rounded border border-slate-200 px-2 text-slate-700 disabled:opacity-40"
            disabled={!goToPageInput}
            onClick={submitPageJump}
            type="button"
          >
            跳转
          </button>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  icon: Icon,
  label,
  className = "text-slate-500 hover:bg-slate-100 hover:text-brand-700",
  onClick,
}: {
  icon: typeof Eye;
  label: string;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button className={cn("grid h-7 w-7 place-items-center rounded", className)} onClick={onClick} title={label} type="button">
      <Icon size={14} />
    </button>
  );
}

interface FileIconMeta {
  Icon: LucideIcon;
  bgClass: string;
  textClass: string;
  label: string;
}

function getFileIcon(doc: DocumentDto): FileIconMeta {
  const mime = (doc.mime || "").toLowerCase();
  const title = (doc.title || "").toLowerCase();
  const ext = (() => {
    const idx = title.lastIndexOf(".");
    return idx >= 0 ? title.slice(idx) : "";
  })();

  if (mime === "application/pdf" || ext === ".pdf") {
    return { Icon: FileText, bgClass: "bg-rose-50 ring-rose-100", textClass: "text-rose-600", label: "PDF" };
  }
  if (
    mime.includes("word") ||
    mime.includes("wordprocessingml") ||
    [".doc", ".docx", ".docm"].includes(ext)
  ) {
    return { Icon: FileText, bgClass: "bg-blue-50 ring-blue-100", textClass: "text-blue-600", label: "DOCX" };
  }
  if (
    mime.includes("excel") ||
    mime.includes("spreadsheetml") ||
    mime.includes("sheet") ||
    [".xls", ".xlsx", ".xlsm"].includes(ext)
  ) {
    return {
      Icon: FileSpreadsheet,
      bgClass: "bg-emerald-50 ring-emerald-100",
      textClass: "text-emerald-600",
      label: "XLSX",
    };
  }
  if (
    mime.includes("powerpoint") ||
    mime.includes("presentationml") ||
    mime.includes("presentation") ||
    [".ppt", ".pptx", ".pptm"].includes(ext)
  ) {
    return {
      Icon: Presentation,
      bgClass: "bg-orange-50 ring-orange-100",
      textClass: "text-orange-600",
      label: "PPTX",
    };
  }
  if (
    mime.startsWith("image/") ||
    [".png", ".jpg", ".jpeg", ".jpe", ".jfif", ".webp", ".bmp", ".tif", ".tiff"].includes(ext)
  ) {
    return { Icon: FileImage, bgClass: "bg-purple-50 ring-purple-100", textClass: "text-purple-600", label: "IMG" };
  }
  if (mime.startsWith("video/") || [".mp4", ".mov", ".mkv", ".webm"].includes(ext)) {
    return {
      Icon: FileVideo,
      bgClass: "bg-indigo-50 ring-indigo-100",
      textClass: "text-indigo-600",
      label: "VIDEO",
    };
  }
  if (
    mime.startsWith("audio/") ||
    [".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".amr", ".wma"].includes(ext)
  ) {
    return { Icon: FileAudio, bgClass: "bg-pink-50 ring-pink-100", textClass: "text-pink-600", label: "AUDIO" };
  }
  if (
    mime.startsWith("text/") ||
    [
      ".txt",
      ".text",
      ".md",
      ".markdown",
      ".csv",
      ".tsv",
      ".json",
      ".jsonl",
      ".log",
      ".xml",
      ".html",
      ".htm",
      ".yaml",
      ".yml",
    ].includes(ext)
  ) {
    return { Icon: FileText, bgClass: "bg-slate-100 ring-slate-200", textClass: "text-slate-600", label: "TXT" };
  }
  return { Icon: File, bgClass: "bg-slate-100 ring-slate-200", textClass: "text-slate-500", label: "FILE" };
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
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
