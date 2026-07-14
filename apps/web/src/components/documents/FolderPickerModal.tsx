"use client";
// 目标文件夹选择弹窗：复用 FolderTree 单选任意节点，替代批量移动的 window.prompt
// 受控用法：open 控制显隐，onConfirm 回传选中的 folderId（必为真实文件夹，非根）
import { useEffect, useState } from "react";
import { FolderInput, X } from "lucide-react";
import type { Folder } from "@/types/api";
import { cn } from "@/lib/utils";
import { FolderTree } from "./FolderTree";

interface FolderPickerModalProps {
  open: boolean;
  folders: Folder[];
  loading?: boolean;
  /** 待移动的文档数量，用于标题提示 */
  count?: number;
  onClose: () => void;
  onConfirm: (folderId: string) => void;
}

export function FolderPickerModal({
  open,
  folders,
  loading,
  count,
  onClose,
  onConfirm,
}: FolderPickerModalProps) {
  const [selected, setSelected] = useState<string | null>(null);

  // 每次打开重置选择
  useEffect(() => {
    if (open) setSelected(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6"
      role="dialog"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-white p-5 shadow-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <FolderInput size={18} className="text-brand-600" />
          <h3 className="text-sm font-semibold text-slate-900">
            移动{count ? ` ${count} 个` : ""}文档到…
          </h3>
          <button
            aria-label="关闭"
            className="ml-auto rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <p className="mt-1.5 text-xs text-slate-500">选择目标文件夹后点击「移动到此」。</p>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-2">
          <FolderTree
            folders={folders}
            selectedFolderId={selected}
            onSelect={setSelected}
            loading={loading}
          />
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            className="h-8 rounded-lg border border-slate-200 px-4 text-[13px] text-slate-700 transition hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            className={cn(
              "h-8 rounded-lg px-4 text-[13px] font-medium text-white transition",
              selected ? "bg-brand-600 hover:bg-brand-700" : "cursor-not-allowed bg-slate-300",
            )}
            disabled={!selected}
            onClick={() => selected && onConfirm(selected)}
            type="button"
          >
            移动到此
          </button>
        </div>
      </div>
    </div>
  );
}
