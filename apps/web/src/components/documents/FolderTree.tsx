import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder as FolderIcon,
  FolderOpen,
  FolderTree as FolderTreeIcon,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { Folder } from "@/types/api";
import { cn } from "@/lib/utils";

interface FolderTreeProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  loading?: boolean;
  className?: string;
  onDeleteFolder?: (folderId: string, folderName: string) => void;
  onCreateSubfolder?: (parentId: string, name: string) => void;
  onRenameFolder?: (folderId: string, newName: string) => void;
}

export function FolderTree({
  folders,
  selectedFolderId,
  onSelect,
  loading = false,
  className,
  onDeleteFolder,
  onCreateSubfolder,
  onRenameFolder,
}: FolderTreeProps) {
  const initialized = useRef(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (initialized.current || folders.length === 0) return;
    initialized.current = true;
    const ids = new Set<string>();
    const collect = (list: Folder[]) => {
      for (const f of list) {
        if (f.children?.length) {
          ids.add(f.id);
          collect(f.children);
        }
      }
    };
    collect(folders);
    setExpanded(ids);
  }, [folders]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 px-2 py-3 text-xs text-slate-400", className)}>
        <Loader2 size={14} className="animate-spin" />
        加载文件夹...
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <button
        className={cn(
          "flex h-8 items-center gap-1.5 rounded px-2 text-left text-[13px] transition",
          selectedFolderId === null
            ? "bg-brand-50 font-medium text-brand-700"
            : "text-slate-700 hover:bg-white hover:text-slate-950",
        )}
        onClick={() => onSelect(null)}
        type="button"
      >
        <FolderTreeIcon size={15} className={selectedFolderId === null ? "text-brand-600" : "text-slate-400"} />
        <span className="truncate">全部文件</span>
      </button>

      {folders.length === 0 ? (
        <div className="px-2 py-2 text-xs text-slate-400">暂无文件夹</div>
      ) : (
        <div className="mt-0.5">
          {folders.map((folder) => (
            <TreeNode
              key={folder.id}
              folder={folder}
              depth={0}
              expanded={expanded}
              selectedFolderId={selectedFolderId}
              onToggleExpand={toggleExpand}
              onSelect={onSelect}
              onDeleteFolder={onDeleteFolder}
              onCreateSubfolder={onCreateSubfolder}
              onRenameFolder={onRenameFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface TreeNodeProps {
  folder: Folder;
  depth: number;
  expanded: Set<string>;
  selectedFolderId: string | null;
  onToggleExpand: (id: string) => void;
  onSelect: (folderId: string | null) => void;
  onDeleteFolder?: (folderId: string, folderName: string) => void;
  onCreateSubfolder?: (parentId: string, name: string) => void;
  onRenameFolder?: (folderId: string, newName: string) => void;
}

function TreeNode({
  folder,
  depth,
  expanded,
  selectedFolderId,
  onToggleExpand,
  onSelect,
  onDeleteFolder,
  onCreateSubfolder,
  onRenameFolder,
}: TreeNodeProps) {
  const hasChildren = Boolean(folder.children?.length);
  const isExpanded = expanded.has(folder.id);
  const isSelected = selectedFolderId === folder.id;
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const canManage = Boolean(onDeleteFolder || onCreateSubfolder || onRenameFolder);

  useEffect(() => {
    if (creating || renaming) {
      inputRef.current?.focus();
      if (creating && !isExpanded) onToggleExpand(folder.id);
    }
  }, [creating, renaming, folder.id, isExpanded, onToggleExpand]);

  function startCreate() {
    setNewName("");
    setCreating(true);
  }

  function confirmCreate() {
    const name = newName.trim();
    if (!name) {
      setCreating(false);
      return;
    }
    onCreateSubfolder?.(folder.id, name);
    setCreating(false);
    setNewName("");
  }

  function startRename() {
    setRenameValue(folder.name);
    setRenaming(true);
  }

  function confirmRename() {
    const name = renameValue.trim();
    if (!name || name === folder.name) {
      setRenaming(false);
      return;
    }
    onRenameFolder?.(folder.id, name);
    setRenaming(false);
  }

  function handleDelete() {
    onDeleteFolder?.(folder.id, folder.name);
  }

  return (
    <div>
      <div
        className={cn(
          "group flex h-8 items-center gap-0.5 rounded pr-2 text-left text-[13px] transition",
          isSelected
            ? "bg-brand-50 font-medium text-brand-700"
            : "text-slate-700 hover:bg-white hover:text-slate-950",
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {hasChildren ? (
          <button
            className="grid h-5 w-5 shrink-0 place-items-center rounded text-slate-400 hover:text-slate-700"
            onClick={() => onToggleExpand(folder.id)}
            type="button"
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <button
          className="flex min-w-0 flex-1 items-center gap-1.5"
          onClick={() => onSelect(folder.id)}
          type="button"
        >
          {isSelected ? (
            <FolderOpen size={15} className="shrink-0 text-brand-600" />
          ) : (
            <FolderIcon size={15} className="shrink-0 text-slate-400" />
          )}
          {renaming ? (
            <input
              ref={inputRef}
              className="min-w-0 flex-1 rounded border border-brand-300 bg-white px-1.5 py-0.5 text-[13px] outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-200"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              onBlur={confirmRename}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate">{folder.name}</span>
          )}
        </button>
        {canManage && !renaming && (
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
            {onCreateSubfolder && (
              <button
                className="grid h-5 w-5 place-items-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                onClick={startCreate}
                title="新建子文件夹"
                type="button"
              >
                <Plus size={14} />
              </button>
            )}
            {onRenameFolder && (
              <button
                className="grid h-5 w-5 place-items-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                onClick={startRename}
                title="重命名"
                type="button"
              >
                <Pencil size={13} />
              </button>
            )}
            {onDeleteFolder && (
              <button
                className="grid h-5 w-5 place-items-center rounded text-slate-400 hover:bg-rose-100 hover:text-rose-600"
                onClick={handleDelete}
                title="删除文件夹"
                type="button"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {creating && (
        <div
          className="flex h-8 items-center gap-0.5 rounded pr-2"
          style={{ paddingLeft: `${(depth + 1) * 12 + 4}px` }}
        >
          <span className="w-5 shrink-0" />
          <FolderIcon size={15} className="shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            className="min-w-0 flex-1 rounded border border-brand-300 bg-white px-1.5 py-0.5 text-[13px] outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-200"
            placeholder="文件夹名称"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmCreate();
              if (e.key === "Escape") setCreating(false);
            }}
            onBlur={confirmCreate}
          />
        </div>
      )}

      {hasChildren && isExpanded && (
        <div>
          {folder.children!.map((child) => (
            <TreeNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              expanded={expanded}
              selectedFolderId={selectedFolderId}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onDeleteFolder={onDeleteFolder}
              onCreateSubfolder={onCreateSubfolder}
              onRenameFolder={onRenameFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}
