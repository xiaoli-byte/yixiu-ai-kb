import { Archive, Download, FolderInput, RotateCcw, ShieldCheck, Trash2, X } from "lucide-react";
import { EditorOrAbove } from "@/components/PermissionGate";
import { useThrottleFn } from "@/hooks/useThrottleFn";

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
  // 节流：批量操作按钮点击即发请求，防止连点/双击导致重复请求（Hook 需在提前 return 之前调用）
  const throttledDownload = useThrottleFn(onDownload, 800);
  const throttledMove = useThrottleFn(onMove, 800);
  const throttledArchive = useThrottleFn(onArchive, 800);
  const throttledRestore = useThrottleFn(onRestore, 800);
  const throttledPermissions = useThrottleFn(onPermissions, 800);
  const throttledDelete = useThrottleFn(onDelete, 800);

  if (selectedCount <= 0) return null;

  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-3 border-b border-brand-100 bg-brand-50 px-6 py-2">
      <span className="text-[13px] text-brand-800">已选择 {selectedCount} 个文档</span>
      <div className="flex flex-wrap items-center gap-1">
        <BatchButton icon={Download} label="批量下载" onClick={throttledDownload} />
        {/* 移动/归档/恢复/设置权限/删除均为写操作，对非 editor+ 角色隐藏；下载保持原样 */}
        <EditorOrAbove hidden>
          {onMove && <BatchButton icon={FolderInput} label="批量移动" onClick={throttledMove} />}
          {onArchive && <BatchButton icon={Archive} label="批量归档" onClick={throttledArchive} />}
          {onRestore && <BatchButton icon={RotateCcw} label="恢复" onClick={throttledRestore} />}
          {onPermissions && <BatchButton icon={ShieldCheck} label="批量设置权限" onClick={throttledPermissions} />}
          <BatchButton className="text-rose-700 hover:bg-rose-50" icon={Trash2} label="批量删除" onClick={throttledDelete} />
        </EditorOrAbove>
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
