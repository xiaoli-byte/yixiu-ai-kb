"use client";
import { useEffect, useState } from "react";
import {
  FolderOpen,
  FolderPlus,
  Tag,
  TagIcon,
  Loader2,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Trash2,
  Edit2,
  X,
  Check,
} from "lucide-react";
import { ApiError } from "@/lib/api-client";
import foldersApi from "@/services/folders";
import tagsApi from "@/services/tags";
import { cn } from "@/lib/utils";
import { EditorOrAbove } from "./PermissionGate";

interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  children?: Folder[];
}

interface Tag {
  id: string;
  name: string;
  type: string;
  documentCount?: number;
}

export default function FolderTagManager({
  onFoldersChange,
}: {
  onFoldersChange?: () => void;
}) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"folders" | "tags">("folders");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editItem, setEditItem] = useState<Folder | Tag | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  async function fetchFolders() {
    try {
      const res = await foldersApi.tree();
      setFolders(res || []);
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchTags() {
    try {
      const res = await tagsApi.stats();
      setTags(res || []);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    fetchFolders();
    fetchTags();
  }, []);

  async function handleCreateFolder(data: { name: string; parentId?: string }) {
    setSubmitting(true);
    try {
      await foldersApi.create(data);
      setShowCreateModal(false);
      await fetchFolders();
      onFoldersChange?.();
    } catch (e: any) {
      if (e instanceof ApiError) alert(e.message);
    } finally {
      setSubmitting(false);
    }
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

  async function handleCreateTag(name: string) {
    setSubmitting(true);
    try {
      await tagsApi.create({ name });
      setShowCreateModal(false);
      await fetchTags();
    } catch (e: any) {
      if (e instanceof ApiError) alert(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateTag(id: string, name: string) {
    setSubmitting(true);
    try {
      await tagsApi.update(id, name);
      setEditItem(null);
      await fetchTags();
    } catch (e: any) {
      if (e instanceof ApiError) alert(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteTag(id: string, name: string) {
    if (!confirm(`确认删除标签 "${name}"？该标签将从所有文档中移除。`)) return;
    try {
      await tagsApi.remove(id);
      await fetchTags();
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
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab("folders")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition",
              activeTab === "folders"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            <FolderOpen size={16} />
            文件夹
          </button>
          <button
            onClick={() => setActiveTab("tags")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition",
              activeTab === "tags"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            <TagIcon size={16} />
            标签
          </button>
        </div>
        <EditorOrAbove hidden>
          <button
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            {activeTab === "folders" ? <FolderPlus size={14} /> : <Tag size={14} />}
            {activeTab === "folders" ? "新建文件夹" : "新建标签"}
          </button>
        </EditorOrAbove>
      </div>

      {activeTab === "folders" ? (
        <div className="card overflow-hidden">
          {folders.length === 0 ? (
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
                          onClick={() => setEditItem(f)}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          className="btn-ghost px-2 py-1 text-rose-600"
                          onClick={() => handleDeleteFolder(f.id, f.name)}
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
      ) : (
        <div className="card overflow-hidden">
          {tags.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <TagIcon className="mx-auto mb-2" size={32} />
              <p>暂无标签，点击「新建标签」开始</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">标签</th>
                  <th className="text-left px-4 py-3">类型</th>
                  <th className="text-left px-4 py-3">文档数</th>
                  <th className="text-right px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {tags.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Tag size={14} className="text-brand-500" />
                        <span className="font-medium">{t.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge bg-slate-100 text-slate-600">{t.type}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{t.documentCount || 0}</td>
                    <td className="px-4 py-3 text-right">
                      <EditorOrAbove hidden>
                        <button
                          className="btn-ghost px-2 py-1"
                          onClick={() => setEditItem(t)}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          className="btn-ghost px-2 py-1 text-rose-600"
                          onClick={() => handleDeleteTag(t.id, t.name)}
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
      )}

      {showCreateModal && (
        <Modal
          type={activeTab}
          folders={folders}
          onClose={() => setShowCreateModal(false)}
          onSubmit={activeTab === "folders"
            ? (data: any) => handleCreateFolder(data)
            : (data: any) => handleCreateTag(data.name)}
          submitting={submitting}
        />
      )}

      {editItem && (
        <Modal
          type={activeTab}
          initial={editItem}
          folders={folders}
          onClose={() => setEditItem(null)}
          onSubmit={activeTab === "folders"
            ? (data: any) => handleUpdateFolder(editItem.id, data)
            : (data: any) => handleUpdateTag(editItem.id, data.name)}
          submitting={submitting}
        />
      )}
    </div>
  );
}

interface ModalProps {
  type: "folders" | "tags";
  initial?: Folder | Tag;
  folders: Folder[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  submitting: boolean;
}

function Modal({ type, initial, folders, onClose, onSubmit, submitting }: ModalProps) {
  const [name, setName] = useState(initial ? (initial as any).name : "");
  const [parentId, setParentId] = useState<string>(initial ? (initial as any).parentId || "" : "");
  const [error, setError] = useState("");

  function handleSubmit() {
    if (!name.trim()) { setError("请输入名称"); return; }
    if (type === "folders") {
      if (parentId === initial?.id) { setError("不能将自己设为上级文件夹"); return; }
      onSubmit({ name: name.trim(), parentId: parentId || null });
    } else {
      onSubmit({ name: name.trim() });
    }
  }

  const availableParents = type === "folders"
    ? folders.filter((f: any) => f.id !== initial?.id)
    : [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold">
            {initial ? `编辑${type === "folders" ? "文件夹" : "标签"}` : `新建${type === "folders" ? "文件夹" : "标签"}`}
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
              placeholder={type === "folders" ? "例如：技术文档" : "例如：重要"}
            />
          </div>
          {type === "folders" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">上级文件夹</label>
              <select
                className="input w-full"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">根目录（无上级）</option>
                {availableParents.map((f: any) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}
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
