"use client";
import { useEffect, useRef, useState } from "react";
import {
  Upload,
  Search,
  RefreshCw,
  Trash2,
  Eye,
  FileText,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Folder,
  Tag as TagIcon,
  Plus,
  Edit2,
} from "lucide-react";
import { ApiError } from "@/lib/api-client";
import documentsApi from "@/services/documents";
import foldersApi from "@/services/folders";
import tagsApi from "@/services/tags";
import { formatBytes, statusColor, statusLabel, cn } from "@/lib/utils";
import FolderTagManager from "@/components/FolderTagManager";
import PdfViewerModal from "@/components/PdfViewerModal";
import MarkdownPreviewModal from "@/components/MarkdownPreviewModal";
import { EditorOrAbove, AdminOnly } from "@/components/PermissionGate";
import { Resource, Action } from "@/types/permissions";

interface DocumentDto {
  id: string;
  title: string;
  mime: string;
  size: number;
  status: string;
  folderId: string | null;
  ownerId: string;
  ownerName?: string;
  tags: { id: string; name: string }[];
  createdAt: string;
  updatedAt: string;
}

interface DocumentDetail extends DocumentDto {
  chunks: { id: string; idx: number; text: string; tokens: number }[];
  errorMessage?: string;
}

interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  children?: Folder[];
}

interface Tag {
  id: string;
  name: string;
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentDto[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editDoc, setEditDoc] = useState<DocumentDto | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ id: string; title: string } | null>(null);
  const [mdPreview, setMdPreview] = useState<{ id: string; title: string } | null>(null);

  function isMarkdownDoc(mime: string, title: string): boolean {
    return mime.includes("markdown") || mime === "text/markdown" || title.toLowerCase().endsWith(".md");
  }

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
      const res = await tagsApi.list();
      setTags(res || []);
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchList() {
    setLoading(true);
    try {
      const query: Record<string, any> = { page, pageSize };
      if (q) query.q = q;
      if (status) query.status = status;
      if (selectedFolder) query.folderId = selectedFolder;
      if (selectedTags.length > 0) query.tags = selectedTags.join(",");
      const res = await documentsApi.list(query);
      setDocs(res.items);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchFolders();
    fetchTags();
  }, []);

  useEffect(() => {
    fetchList();
  }, [q, status, selectedFolder, selectedTags, page]);

  async function uploadFiles(files: FileList | null, folderId?: string) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        if (folderId) form.append("folderId", folderId);
        await documentsApi.upload(form);
      }
      setShowUploadModal(false);
      await fetchList();
    } catch (e) {
      if (e instanceof ApiError) alert(e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeDoc(id: string) {
    if (!confirm("确认删除该文档？相关 chunks / 图谱数据将一并清理。")) return;
    try {
      await documentsApi.remove(id);
      setDetail(null);
      await fetchList();
    } catch (e) {
      if (e instanceof ApiError) alert(e.message);
    }
  }

  async function openDetail(id: string) {
    setDetailLoading(true);
    try {
      const d = await documentsApi.get(id);
      setDetail(d);
    } catch (e) {
      if (e instanceof ApiError) alert(e.message);
    } finally {
      setDetailLoading(false);
    }
  }

  function openPdfPreview(id: string, title: string) {
    setPdfPreview({ id, title });
  }

  function openMdPreview(id: string, title: string) {
    setMdPreview({ id, title });
  }

  async function handleEditDoc(id: string, data: { title?: string; folderId?: string | null }) {
    try {
      await documentsApi.update(id, data);
      setEditDoc(null);
      await fetchList();
    } catch (e) {
      if (e instanceof ApiError) alert(e.message);
    }
  }

  async function handleAddTag(docId: string, tagId: string) {
    try {
      await documentsApi.addTag(docId, tagId);
    } catch (e) {
      if (e instanceof ApiError) alert(e.message);
    }
  }

  async function handleRemoveTag(docId: string, tagId: string) {
    try {
      await documentsApi.removeTag(docId, tagId);
    } catch (e) {
      if (e instanceof ApiError) alert(e.message);
    }
  }

  function toggleTag(tagId: string) {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId],
    );
    setPage(1);
  }

  function flattenFolders(folders: Folder[], depth = 0): Array<Folder & { depth: number }> {
    const result: Array<Folder & { depth: number }> = [];
    for (const f of folders) {
      result.push({ ...f, depth });
      if (f.children?.length) {
        result.push(...flattenFolders(f.children, depth + 1));
      }
    }
    return result;
  }

  const flatFolders = flattenFolders(folders);

  function getFolderName(folderId: string | null): string {
    if (!folderId) return "根目录";
    const findFolder = (list: Folder[]): Folder | undefined => {
      for (const f of list) {
        if (f.id === folderId) return f;
        if (f.children) {
          const found = findFolder(f.children);
          if (found) return found;
        }
      }
    };
    return findFolder(folders)?.name || "未知";
  }

  return (
    <div className="flex h-full">
      {/* 左侧边栏 - 文件夹和标签 */}
      <div className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">文件组织</span>
          <EditorOrAbove hidden>
            <button
              className="btn-ghost p-1"
              onClick={() => setShowManager(true)}
              title="管理文件夹和标签"
            >
              <Edit2 size={14} />
            </button>
          </EditorOrAbove>
        </div>

        {/* 文件夹列表 */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-2">
            <div className="text-xs font-medium text-slate-500 uppercase px-2 py-1">文件夹</div>
            <button
              onClick={() => { setSelectedFolder(null); setPage(1); }}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition",
                selectedFolder === null ? "bg-brand-50 text-brand-700 font-medium" : "text-slate-600 hover:bg-slate-50",
              )}
            >
              <FolderOpen size={14} />
              全部文档
            </button>
            {flatFolders.map((f) => (
              <button
                key={f.id}
                onClick={() => { setSelectedFolder(f.id); setPage(1); }}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition",
                  selectedFolder === f.id
                    ? "bg-brand-50 text-brand-700 font-medium"
                    : "text-slate-600 hover:bg-slate-50",
                )}
                style={{ paddingLeft: `${f.depth * 16 + 8}px` }}
              >
                <Folder size={14} className="text-amber-500" />
                {f.name}
              </button>
            ))}
          </div>

          {/* 标签列表 */}
          <div className="p-2 border-t border-slate-100">
            <div className="text-xs font-medium text-slate-500 uppercase px-2 py-1">标签</div>
            <div className="flex flex-wrap gap-1 px-2">
              {tags.map((t) => (
                <button
                  key={t.id}
                  onClick={() => toggleTag(t.id)}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition",
                    selectedTags.includes(t.id)
                      ? "bg-brand-100 text-brand-700 font-medium"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  )}
                >
                  <TagIcon size={10} />
                  {t.name}
                </button>
              ))}
              {tags.length === 0 && (
                <span className="text-xs text-slate-400">暂无标签</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6 pb-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-semibold">文档管理</h1>
              <p className="text-sm text-slate-500 mt-1">
                {selectedFolder
                  ? `文件夹: ${getFolderName(selectedFolder)}`
                  : "全部文档"}
                {selectedTags.length > 0 && ` · 标签: ${selectedTags.length}个`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-ghost" onClick={fetchList}>
                <RefreshCw size={14} /> 刷新
              </button>
              <EditorOrAbove hidden>
                <button className="btn-primary" onClick={() => setShowUploadModal(true)} disabled={uploading}>
                  <Upload size={14} /> 上传文档
                </button>
              </EditorOrAbove>
            </div>
          </div>

          <div className="card p-3 flex items-center gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9 w-full"
                placeholder="搜索文档标题..."
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
              />
            </div>
            <select
              className="input w-36"
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            >
              <option value="">全部状态</option>
              <option value="READY">已就绪</option>
              <option value="PENDING">等待中</option>
              <option value="PARSING">解析中</option>
              <option value="EMBEDDING">向量化</option>
              <option value="FAILED">失败</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 pt-3">
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3">文档</th>
                  <th className="text-left px-4 py-3 w-28">文件夹</th>
                  <th className="text-left px-4 py-3 w-24">标签</th>
                  <th className="text-left px-4 py-3 w-24">大小</th>
                  <th className="text-left px-4 py-3 w-28">状态</th>
                  <th className="text-left px-4 py-3 w-36">更新时间</th>
                  <th className="text-right px-4 py-3 w-32">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading && docs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400">
                      <Loader2 className="inline animate-spin mr-2" size={16} /> 加载中
                    </td>
                  </tr>
                ) : docs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-slate-400">
                      <FileText className="mx-auto mb-2" size={28} />
                      {q || status || selectedFolder || selectedTags.length > 0
                        ? "没有匹配的文档"
                        : "暂无文档，点击「上传文档」开始"}
                    </td>
                  </tr>
                ) : (
                  docs.map((d) => (
                    <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800 truncate max-w-xs">{d.title}</div>
                        <div className="text-xs text-slate-400 truncate">{d.ownerName || "未知"} · {d.mime}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {d.folderId ? getFolderName(d.folderId) : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {d.tags.slice(0, 2).map((t) => (
                            <span key={t.id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 text-xs text-slate-600">
                              <TagIcon size={10} />{t.name}
                            </span>
                          ))}
                          {d.tags.length > 2 && (
                            <span className="text-xs text-slate-400">+{d.tags.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{formatBytes(d.size)}</td>
                      <td className="px-4 py-3">
                        <span className={cn("badge ring-1 ring-inset", statusColor(d.status))}>
                          {d.status === "READY" ? <CheckCircle2 size={10} /> : d.status === "FAILED" ? <AlertCircle size={10} /> : <Loader2 size={10} className="animate-spin" />}
                          {statusLabel(d.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {new Date(d.updatedAt).toLocaleString("zh-CN")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          className="btn-ghost px-2 py-1"
                          onClick={() => isMarkdownDoc(d.mime, d.title) ? openMdPreview(d.id, d.title) : openPdfPreview(d.id, d.title)}
                          title="查看"
                        >
                          <Eye size={14} />
                        </button>
                        <EditorOrAbove hidden>
                          <button className="btn-ghost px-2 py-1" onClick={() => setEditDoc(d)} title="编辑">
                            <Edit2 size={14} />
                          </button>
                          <button className="btn-ghost px-2 py-1 text-rose-600" onClick={() => removeDoc(d.id)} title="删除">
                            <Trash2 size={14} />
                          </button>
                        </EditorOrAbove>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div className="px-4 py-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
              <span>共 {total} 条</span>
              <div className="flex items-center gap-2">
                <button className="btn-ghost px-2 py-1" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  上一页
                </button>
                <span>第 {page} 页</span>
                <button className="btn-ghost px-2 py-1" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>
                  下一页
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 上传弹窗 */}
      {showUploadModal && (
        <UploadModal
          folders={folders}
          onClose={() => setShowUploadModal(false)}
          onUpload={(files, folderId) => uploadFiles(files, folderId)}
          uploading={uploading}
          fileRef={fileRef}
        />
      )}

      {/* 编辑文档弹窗 */}
      {editDoc && (
        <EditDocModal
          doc={editDoc}
          folders={folders}
          tags={tags}
          onClose={() => setEditDoc(null)}
          onSave={(data) => handleEditDoc(editDoc.id, data)}
          onAddTag={(tagId) => handleAddTag(editDoc.id, tagId)}
          onRemoveTag={(tagId) => handleRemoveTag(editDoc.id, tagId)}
        />
      )}

      {/* 文件夹标签管理弹窗 */}
      {showManager && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-6" onClick={() => setShowManager(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold">管理文件夹和标签</h3>
              <button className="btn-ghost p-1" onClick={() => setShowManager(false)}><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <FolderTagManager onFoldersChange={fetchFolders} />
            </div>
          </div>
        </div>
      )}

      {/* 文档详情弹窗 */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-6" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{detail.title}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {detail.chunks.length} 个片段 · {formatBytes(detail.size)} · {detail.mime}
                </p>
              </div>
              <button className="btn-ghost p-1" onClick={() => setDetail(null)}><X size={16} /></button>
            </div>
            <div className="overflow-y-auto p-6 space-y-3">
              {detail.errorMessage && (
                <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
                  {detail.errorMessage}
                </div>
              )}
              {detailLoading ? (
                <div className="text-center py-12 text-slate-400">
                  <Loader2 className="inline animate-spin mr-2" size={16} /> 加载中
                </div>
              ) : detail.chunks.length === 0 ? (
                <div className="text-center text-slate-400 py-12">暂无切片内容</div>
              ) : (
                detail.chunks.map((c) => (
                  <div key={c.id} className="border border-slate-200 rounded-lg p-3">
                    <div className="text-xs text-slate-400 mb-1">#{c.idx} · {c.tokens} tokens</div>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{c.text}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* PDF 预览弹窗 */}
      {pdfPreview && (
        <PdfViewerModal
          documentId={pdfPreview.id}
          title={pdfPreview.title}
          onClose={() => {
            setPdfPreview(null);
            setDetail(null);
          }}
        />
      )}

      {/* Markdown 预览弹窗 */}
      {mdPreview && (
        <MarkdownPreviewModal
          documentId={mdPreview.id}
          title={mdPreview.title}
          onClose={() => {
            setMdPreview(null);
            setDetail(null);
          }}
        />
      )}
    </div>
  );
}

function UploadModal({
  folders,
  onClose,
  onUpload,
  uploading,
  fileRef,
}: {
  folders: Folder[];
  onClose: () => void;
  onUpload: (files: FileList | null, folderId?: string) => void;
  uploading: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const localRef = useRef<HTMLInputElement>(null);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold">上传文档</h3>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">上传到文件夹</label>
            <select
              className="input w-full"
              value={selectedFolder}
              onChange={(e) => setSelectedFolder(e.target.value)}
            >
              <option value="">根目录（不上传到文件夹）</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">选择文件</label>
            <input
              ref={localRef}
              type="file"
              multiple
              accept=".pdf,.md"
              className="hidden"
              onChange={(e) => {
                onUpload(e.target.files, selectedFolder || undefined);
              }}
            />
            <button
              className="w-full btn-ghost border border-slate-300 justify-center py-8 flex flex-col items-center gap-2"
              onClick={() => localRef.current?.click()}
              disabled={uploading}
            >
              <Upload size={24} className="text-slate-400" />
              <span className="text-sm text-slate-500">点击选择文件 或 拖拽文件到此处</span>
              <span className="text-xs text-slate-400">目前暂时仅支持 PDF、Markdown文件</span>
            </button>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
          <button className="btn-ghost" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}

function EditDocModal({
  doc,
  folders,
  tags,
  onClose,
  onSave,
  onAddTag,
  onRemoveTag,
}: {
  doc: DocumentDto;
  folders: Folder[];
  tags: Tag[];
  onClose: () => void;
  onSave: (data: { title?: string; folderId?: string | null }) => void;
  onAddTag: (tagId: string) => void;
  onRemoveTag: (tagId: string) => void;
}) {
  const [title, setTitle] = useState(doc.title);
  const [folderId, setFolderId] = useState<string>(doc.folderId || "");
  const [docTags, setDocTags] = useState(doc.tags);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ title, folderId: folderId || null });
    } finally {
      setSaving(false);
    }
  }

  function handleAddTag(tagId: string) {
    const tag = tags.find((t) => t.id === tagId);
    if (tag) {
      setDocTags([...docTags, { id: tag.id, name: tag.name }]);
      onAddTag(tagId);
    }
  }

  function handleRemoveTag(tagId: string) {
    setDocTags(docTags.filter((t) => t.id !== tagId));
    onRemoveTag(tagId);
  }

  const availableTags = tags.filter((t) => !docTags.some((dt) => dt.id === t.id));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold">编辑文档</h3>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">文档标题</label>
            <input
              type="text"
              className="input w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">文件夹</label>
            <select
              className="input w-full"
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
            >
              <option value="">根目录</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">标签</label>
              <button
                className="text-xs text-brand-600 hover:underline"
                onClick={() => setShowTagPicker(!showTagPicker)}
              >
                {showTagPicker ? "收起" : "+ 添加标签"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {docTags.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 text-xs"
                >
                  <TagIcon size={10} />{t.name}
                  <button onClick={() => handleRemoveTag(t.id)} className="hover:text-rose-600">
                    <X size={10} />
                  </button>
                </span>
              ))}
              {docTags.length === 0 && <span className="text-xs text-slate-400">暂无标签</span>}
            </div>
            {showTagPicker && (
              <div className="border border-slate-200 rounded-lg p-2 max-h-32 overflow-y-auto">
                {availableTags.length === 0 ? (
                  <span className="text-xs text-slate-400">所有标签都已添加</span>
                ) : (
                  availableTags.map((t) => (
                    <button
                      key={t.id}
                      className="w-full text-left px-2 py-1 text-sm hover:bg-slate-50 rounded"
                      onClick={() => { handleAddTag(t.id); setShowTagPicker(false); }}
                    >
                      <TagIcon size={12} className="inline mr-1 text-slate-400" />{t.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
