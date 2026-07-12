"use client";
import { useEffect, useState } from "react";
import {
  FolderOpen,
  FolderPlus,
  Loader2,
  ChevronRight,
  ChevronDown,
  Trash2,
  Edit2,
  Plus,
  X,
  Check,
} from "lucide-react";
import { ApiError } from "@/lib/api-client";
import foldersApi from "@/services/folders";
import { cn } from "@/lib/utils";
import { EditorOrAbove } from "./PermissionGate";

interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  children?: Folder[];
}

export default function FolderTagManager({
  onFoldersChange,
}: {
  onFoldersChange?: () => void;
}) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<Folder | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  async function fetchFolders() {
    setLoading(true);
    try {
      const res = await foldersApi.tree();
      setFolders(res || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchFolders();
  }, []);

  async function handleCreateFolder(data: { name: string; parentId?: string }) {
    setSubmitting(true);
    try {
      await foldersApi.create(data);
      setShowCreateModal(false);
      setCreateParentId(null);
      await fetchFolders();
      onFoldersChange?.();
    } catch (e: any) {
      if (e instanceof ApiError) alert(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function openCreateModal(parentId?: string) {
    setCreateParentId(parentId ?? null);
    setShowCreateModal(true);
  }

  async function handleUpdateFolder(id: string, data: { name: string; parentId?: string | null }) {
    setSubmitting(true);
    try {
      await foldersApi.update(id, data);
      setEditItem(null);
      await fetchFolders();
      onFoldersChange?.();
    } catch (e: any) {
      if (e instanceof ApiError) alert(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteFolder(id: string, name: string) {
    if (!confirm(`确认删除文件夹 "${name}"？文件夹下的文档将移至根目录。`)) return;
    try {
      await foldersApi.remove(id);
      await fetchFolders();
      onFoldersChange?.();
    } catch (e: any) {
      if (e instanceof ApiError) alert(e.message);
    }
  }

  function toggleExpand(id: string) {
    const next = new Set(expandedFolders);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedFolders(next);
  }

  function flattenTree(folders: Folder[], depth = 0): Array<Folder & { depth: number }> {
    const result: Array<Folder & { depth: number }> = [];
    for (const f of folders) {
      result.push({ ...f, depth });
      if (expandedFolders.has(f.id) && f.children?.length) {
        result.push(...flattenTree(f.children, depth + 1));
      }
    }
    return result;
  }

  const flatFolders = flattenTree(folders);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <EditorOrAbove hidden>
          <button
            className="btn-primary"
            onClick={() => openCreateModal()}
          >
            <FolderPlus size={14} />
            新建文件夹
          </button>
        </EditorOrAbove>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="mr-2 animate-spin" size={20} />
            加载中...
          </div>
        ) : folders.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <FolderOpen className="mx-auto mb-2" size={32} />
            <p>暂无文件夹，点击「新建文件夹」开始</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 w-8"></th>
                <th className="text-left px-4 py-3">名称</th>
                <th className="text-left px-4 py-3">路径</th>
                <th className="text-right px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {flatFolders.map((f) => (
                <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-4 py-2">
                    {f.children?.length ? (
                      <button
                        onClick={() => toggleExpand(f.id)}
                        className="p-1 hover:bg-slate-200 rounded"
                      >
                        {expandedFolders.has(f.id) ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronRight size={14} />
                        )}
                      </button>
                    ) : (
                      <span className="w-6 inline-block" />
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div
                      className="flex items-center gap-2"
                      style={{ paddingLeft: f.depth * 20 }}
                    >
                      <FolderOpen size={16} className="text-amber-500" />
                      <span className="font-medium">{f.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-slate-500 text-xs">
                    {f.depth === 0 ? "根目录" : f.parentId ? `子文件夹` : "根目录"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <EditorOrAbove hidden>
                      <button
                        className="btn-ghost px-2 py-1"
                        onClick={() => openCreateModal(f.id)}
                        title="新建子文件夹"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        className="btn-ghost px-2 py-1"
                        onClick={() => setEditItem(f)}
                        title="编辑"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        className="btn-ghost px-2 py-1 text-rose-600"
                        onClick={() => handleDeleteFolder(f.id, f.name)}
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </EditorOrAbove>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreateModal && (
        <FolderModal
          folders={folders}
          presetParentId={createParentId}
          onClose={() => { setShowCreateModal(false); setCreateParentId(null); }}
          onSubmit={handleCreateFolder}
          submitting={submitting}
        />
      )}

      {editItem && (
        <FolderModal
          initial={editItem}
          folders={folders}
          onClose={() => setEditItem(null)}
          onSubmit={(data: any) => handleUpdateFolder(editItem.id, data)}
          submitting={submitting}
        />
      )}
    </div>
  );
}

interface FolderModalProps {
  initial?: Folder;
  folders: Folder[];
  presetParentId?: string | null;
  onClose: () => void;
  onSubmit: (data: any) => void;
  submitting: boolean;
}

function FolderModal({ initial, folders, presetParentId, onClose, onSubmit, submitting }: FolderModalProps) {
  const [name, setName] = useState(initial ? initial.name : "");
  const [parentId, setParentId] = useState<string>(
    initial ? initial.parentId || "" : presetParentId || "",
  );
  const [error, setError] = useState("");

  function handleSubmit() {
    if (!name.trim()) { setError("请输入名称"); return; }
    if (parentId === initial?.id) { setError("不能将自己设为上级文件夹"); return; }
    onSubmit({ name: name.trim(), parentId: parentId || null });
  }

  const availableParents = folders.filter((f) => f.id !== initial?.id);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold">
            {initial ? "编辑文件夹" : "新建文件夹"}
          </h3>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              名称 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              className={cn("input w-full", error && !name.trim() && "border-rose-300")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：技术文档"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">上级文件夹</label>
            <select
              className="input w-full"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">根目录（无上级）</option>
              {availableParents.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-xs text-rose-500">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {initial ? "保存" : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
