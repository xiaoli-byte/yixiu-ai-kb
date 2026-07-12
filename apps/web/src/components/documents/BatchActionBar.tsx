import { Archive, Download, FolderInput, RotateCcw, ShieldCheck, Trash2, X } from "lucide-react";

interface BatchActionBarProps {
  selectedCount: number;
  onDownload: () => void;
  onDelete: () => void;
  onMove?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onPermissions?: () => void;
  onClear: () => void;
}

export function BatchActionBar({
  selectedCount,
  onDownload,
  onDelete,
  onMove,
  onArchive,
  onRestore,
  onPermissions,
  onClear,
}: BatchActionBarProps) {
  if (selectedCount <= 0) return null;

  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-3 border-b border-brand-100 bg-brand-50 px-6 py-2">
      <span className="text-[13px] text-brand-800">已选择 {selectedCount} 个文档</span>
      <div className="flex flex-wrap items-center gap-1">
        <BatchButton icon={Download} label="批量下载" onClick={onDownload} />
        {onMove && <BatchButton icon={FolderInput} label="批量移动" onClick={onMove} />}
        {onArchive && <BatchButton icon={Archive} label="批量归档" onClick={onArchive} />}
        {onRestore && <BatchButton icon={RotateCcw} label="恢复" onClick={onRestore} />}
        {onPermissions && <BatchButton icon={ShieldCheck} label="批量设置权限" onClick={onPermissions} />}
        <BatchButton className="text-rose-700 hover:bg-rose-50" icon={Trash2} label="批量删除" onClick={onDelete} />
        <button
          className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs text-slate-600 hover:bg-white"
          onClick={onClear}
          type="button"
        >
          <X size={13} />
          取消选择
        </button>
      </div>
    </div>
  );
}

function BatchButton({
  icon: Icon,
  label,
  className = "text-brand-700 hover:bg-white",
  onClick,
}: {
  icon: typeof Download;
  label: string;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button className={`inline-flex h-7 items-center gap-1 rounded px-2 text-xs ${className}`} onClick={onClick} type="button">
      <Icon size={13} />
      {label}
    </button>
  );
}
