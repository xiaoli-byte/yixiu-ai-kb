"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderPlus, Loader2, Upload, X } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { buildDocumentFileUrl } from "@/services/qa";
import documentsApi, {
  type DocumentBatchAction,
  type DocumentBatchUploadResult,
  type DocumentDetail,
  type DocumentDto,
  type DocumentListQuery,
  type DocumentPermissionScope,
  type DocumentPermissionUpdateRequest,
  type DocumentStatus,
} from "@/services/documents";
import foldersApi from "@/services/folders";
import type { Folder } from "@/types/api";
import FolderTagManager from "@/components/FolderTagManager";
import MarkdownPreviewModal from "@/components/MarkdownPreviewModal";
import PdfViewerModal from "@/components/PdfViewerModal";
import { BatchActionBar } from "@/components/documents/BatchActionBar";
import { DocumentScopeNav, type DocumentScope } from "@/components/documents/DocumentScopeNav";
import { DocumentTable } from "@/components/documents/DocumentTable";
import { DocumentToolbar } from "@/components/documents/DocumentToolbar";
import { FolderTree } from "@/components/documents/FolderTree";
import { PermissionModal, type PermissionModalTarget } from "@/components/documents/PermissionModal";
import { formatBytes } from "@/lib/utils";
import { toast, confirmDialog } from "@/components/ui/feedback";
import { mergeUploadFiles, uploadFileKey } from "./uploadSelection";

const SUPPORTED_UPLOAD_ACCEPT = [
  ".pdf",
  ".md",
  ".markdown",
  ".txt",
  ".csv",
  ".json",
  ".jsonl",
  ".docx",
  ".doc",
  ".docm",
  ".xlsx",
  ".xls",
  ".xlsm",
  ".pptx",
  ".ppt",
  ".pptm",
  ".wav",
  ".mp3",
  ".m4a",
  ".aac",
  ".flac",
  ".ogg",
  ".opus",
  ".webm",
  ".amr",
  ".wma",
  ".mp4",
  ".mov",
  ".mkv",
  ".png",
  ".jpg",
  ".jpeg",
  ".jpe",
  ".jfif",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
  "image/*",
].join(",");

const PAGE_SIZE = 20;

// 构建期内联：生产构建下切片 Token 调试按钮直接不渲染
const IS_DEV = process.env.NODE_ENV === "development";

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentDto[]>([]);
  const [total, setTotal] = useState(0);
  const [scope, setScope] = useState<DocumentScope>("mine");
  const [query, setQuery] = useState("");
  const [fileType, setFileType] = useState("");
  const [status, setStatus] = useState<DocumentStatus | "">("");
  const [permissionScope, setPermissionScope] = useState<DocumentPermissionScope | "">("");
  const [uploaderId, setUploaderId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [uploadedFrom, setUploadedFrom] = useState("");
  const [uploadedTo, setUploadedTo] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<DocumentBatchUploadResult[]>([]);
  const [permissionSaving, setPermissionSaving] = useState(false);

  const [folders, setFolders] = useState<Folder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editDoc, setEditDoc] = useState<DocumentDto | null>(null);
  const [permissionTarget, setPermissionTarget] = useState<PermissionModalTarget | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ id: string; title: string } | null>(null);
  const [mdPreview, setMdPreview] = useState<{ id: string; title: string } | null>(null);

  const activeTitle = useMemo(() => {
    const map: Record<DocumentScope, string> = {
      mine: "我的文档",
      public: "公共文档",
      department: "部门文档",
      archive: "回收站",
      all: "全部文档",
    };
    return map[scope] || "文档管理";
  }, [scope]);

  const fetchFolders = useCallback(async () => {
    setFoldersLoading(true);
    try {
      const res = await foldersApi.tree();
      setFolders(res || []);
    } catch (error) {
      console.error(error);
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  async function handleDeleteFolder(targetFolderId: string, folderName: string) {
    const ok = await confirmDialog({
      title: `删除文件夹「${folderName}」？`,
      description: "文件夹下的文档将移至根目录。",
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    try {
      await foldersApi.remove(targetFolderId);
      setFolderId((current) => (current === targetFolderId ? null : current));
      await fetchFolders();
    } catch (error) {
      showApiError(error);
    }
  }

  async function handleCreateSubfolder(parentId: string, name: string) {
    try {
      await foldersApi.create({ name, parentId });
      await fetchFolders();
    } catch (error) {
      showApiError(error);
    }
  }

  async function handleRenameFolder(folderId: string, newName: string) {
    try {
      await foldersApi.update(folderId, { name: newName });
      await fetchFolders();
    } catch (error) {
      showApiError(error);
    }
  }

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const listQuery: DocumentListQuery = {
        page,
        pageSize: PAGE_SIZE,
        scope,
        archived: resolveArchivedQuery(scope),
        q: query.trim() || undefined,
        fileType: fileType || undefined,
        status: status || undefined,
        permissionScope: permissionScope || undefined,
        uploaderId: uploaderId.trim() || undefined,
        departmentId: departmentId.trim() || undefined,
        uploadedFrom: uploadedFrom || undefined,
        uploadedTo: uploadedTo || undefined,
        folderId: folderId || undefined,
      };
      const res = await documentsApi.list(listQuery);
      setDocs((res.items || []).map(normalizeDocument));
      setTotal(res.total || 0);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [
    departmentId,
    fileType,
    folderId,
    page,
    permissionScope,
    query,
    scope,
    status,
    uploadedFrom,
    uploadedTo,
    uploaderId,
  ]);

  useEffect(() => {
    void fetchFolders();
  }, [fetchFolders]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const resetToFirstPage = useCallback((fn: () => void) => {
    fn();
    setPage(1);
    setSelectedIds([]);
  }, []);

  function isMarkdownDoc(mime: string, title: string): boolean {
    return mime.includes("markdown") || mime === "text/markdown" || title.toLowerCase().endsWith(".md");
  }

  function isPdfDoc(mime: string, title: string): boolean {
    return mime === "application/pdf" || title.toLowerCase().endsWith(".pdf");
  }

  async function uploadFiles(files: File[], folderId?: string) {
    if (files.length === 0) return;
    setUploading(true);
    setUploadResults([]);
    try {
      const form = new FormData();
      for (const file of files) {
        form.append("files", file);
      }
      if (folderId) form.append("folderId", folderId);
      const result = await documentsApi.uploadBatch(form);
      setUploadResults(result.results);
      await fetchList();
      if (result.failed === 0) {
        setShowUploadModal(false);
        setUploadResults([]);
      }
    } catch (error) {
      showApiError(error);
    } finally {
      setUploading(false);
    }
  }

  function openUploadModal() {
    setUploadResults([]);
    setShowUploadModal(true);
  }

  function closeUploadModal() {
    if (uploading) return;
    setUploadResults([]);
    setShowUploadModal(false);
  }

  async function openDetail(id: string) {
    setDetailLoading(true);
    try {
      const doc = await documentsApi.get(id);
      setDetail(normalizeDocument(doc) as DocumentDetail);
    } catch (error) {
      showApiError(error);
    } finally {
      setDetailLoading(false);
    }
  }

  function viewDocument(doc: DocumentDto) {
    if (isMarkdownDoc(doc.mime, doc.title)) {
      setMdPreview({ id: doc.id, title: doc.title });
    } else if (isPdfDoc(doc.mime, doc.title)) {
      setPdfPreview({ id: doc.id, title: doc.title });
    } else {
      void openDetail(doc.id);
    }
  }

  function downloadDocument(doc: DocumentDto) {
    if (typeof window !== "undefined") {
      window.open(buildDocumentFileUrl(doc.id), "_blank", "noopener,noreferrer");
    }
  }

  async function removeDoc(doc: DocumentDto) {
    const ok = await confirmDialog({
      title: `删除「${doc.title}」？`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    try {
      await documentsApi.remove(doc.id);
      setSelectedIds((ids) => ids.filter((id) => id !== doc.id));
      await fetchList();
    } catch (error) {
      showApiError(error);
    }
  }

  async function retryParse(doc: DocumentDto) {
    try {
      await documentsApi.retryParse(doc.id);
      await fetchList();
    } catch (error) {
      showApiError(error);
    }
  }

  async function restoreDoc(doc: DocumentDto) {
    const ok = await confirmDialog({
      title: `恢复「${doc.title}」？`,
      confirmText: "恢复",
    });
    if (!ok) return;
    try {
      await documentsApi.batchDocuments({ action: "RESTORE", documentIds: [doc.id] });
      await fetchList();
    } catch (error) {
      showApiError(error);
    }
  }

  async function handleEditDoc(id: string, data: { title?: string; folderId?: string | null }) {
    try {
      await documentsApi.update(id, data);
      setEditDoc(null);
      await fetchList();
    } catch (error) {
      showApiError(error);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleAllVisible() {
    const visibleIds = docs.map((doc) => doc.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...current, ...visibleIds])),
    );
  }

  function openSinglePermission(doc: DocumentDto) {
    setPermissionTarget({
      type: "single",
      documentId: doc.id,
      documentName: doc.title,
      currentPermissionScope: doc.permissionScope,
      searchable: doc.searchable,
      aiReferenceEnabled: doc.aiReferenceEnabled,
    });
  }

  function openBatchPermission() {
    if (selectedIds.length === 0) return;
    setPermissionTarget({ type: "batch", count: selectedIds.length, documentIds: selectedIds });
  }

  async function savePermissions(request: DocumentPermissionUpdateRequest) {
    if (!permissionTarget) return;
    setPermissionSaving(true);
    try {
      if (permissionTarget.type === "single" && permissionTarget.documentId) {
        await documentsApi.setPermissions(permissionTarget.documentId, request);
      } else {
        const documentIds = permissionTarget.type === "batch" ? permissionTarget.documentIds || selectedIds : selectedIds;
        await documentsApi.setBatchPermissions({ ...request, documentIds });
      }
      setPermissionTarget(null);
      setSelectedIds([]);
      await fetchList();
    } catch (error) {
      showApiError(error);
    } finally {
      setPermissionSaving(false);
    }
  }

  async function runBatch(action: DocumentBatchAction) {
    if (selectedIds.length === 0) return;
    if (action === "DELETE" || action === "ARCHIVE" || action === "RESTORE") {
      const actionLabel = action === "DELETE" ? "删除" : action === "ARCHIVE" ? "归档" : "恢复";
      const ok = await confirmDialog({
        title: `批量${actionLabel} ${selectedIds.length} 个文档？`,
        confirmText: actionLabel,
        danger: action === "DELETE",
      });
      if (!ok) return;
    }

    const payload: { action: DocumentBatchAction; documentIds: string[]; folderId?: string } = {
      action,
      documentIds: selectedIds,
    };

    if (action === "MOVE") {
      const folderId = window.prompt("请输入目标文件夹 ID");
      if (!folderId) return;
      payload.folderId = folderId;
    }

    try {
      const result = await documentsApi.batchDocuments(payload);
      const failed = result.results.filter((item) => !item.ok);
      if (failed.length > 0) {
        toast.error(`批量操作完成，${failed.length} 个文档失败`);
      } else {
        toast.success("批量操作完成");
      }
      setSelectedIds([]);
      await fetchList();
    } catch (error) {
      showApiError(error);
    }
  }

  function clearFilters() {
    resetToFirstPage(() => {
      setQuery("");
      setFileType("");
      setStatus("");
      setPermissionScope("");
      setUploaderId("");
      setDepartmentId("");
      setUploadedFrom("");
      setUploadedTo("");
    });
  }

  return (
    <div className="flex h-full min-h-0 bg-white">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50/80">
        <DocumentScopeNav
          value={scope}
          onChange={(nextScope) =>
            resetToFirstPage(() => {
              setScope(nextScope);
              setFolderId(null);
            })
          }
        />
        {scope !== "archive" && (
          <div className="flex min-h-0 flex-1 flex-col border-t border-slate-200">
            <div className="flex items-center justify-between px-3 pt-4 pb-2">
              <div className="px-2 text-xs font-medium text-slate-500">文件夹</div>
              <button
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                onClick={() => setShowManager(true)}
                title="新建文件夹"
                type="button"
              >
                <FolderPlus size={14} />
                新建文件夹
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-4">
              <FolderTree
                folders={folders}
                selectedFolderId={folderId}
                loading={foldersLoading}
                onSelect={(id) => resetToFirstPage(() => setFolderId(id))}
                onDeleteFolder={handleDeleteFolder}
                onCreateSubfolder={handleCreateSubfolder}
                onRenameFolder={handleRenameFolder}
              />
            </div>
          </div>
        )}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[68px] items-center justify-between border-b border-slate-200 bg-white px-6">
          <div>
            <nav className="mb-1 text-xs text-slate-500">文档管理 / {activeTitle}</nav>
            <h1 className="text-lg font-medium text-slate-950">{activeTitle}</h1>
          </div>
          <div className="text-xs text-slate-500">
            共 {total} 条 · 已选 {selectedIds.length} 条
          </div>
        </header>

        <DocumentToolbar
          fileType={fileType}
          departmentId={departmentId}
          loading={loading}
          moreOpen={moreOpen}
          permissionScope={permissionScope}
          query={query}
          status={status}
          uploadedFrom={uploadedFrom}
          uploadedTo={uploadedTo}
          uploading={uploading}
          uploaderId={uploaderId}
          onClearFilters={clearFilters}
          onDepartmentIdChange={(nextDepartmentId) => resetToFirstPage(() => setDepartmentId(nextDepartmentId))}
          onFileTypeChange={(nextFileType) => resetToFirstPage(() => setFileType(nextFileType))}
          onPermissionScopeChange={(nextScope) => resetToFirstPage(() => setPermissionScope(nextScope))}
          onQueryChange={(nextQuery) => resetToFirstPage(() => setQuery(nextQuery))}
          onRefresh={() => void fetchList()}
          onStatusChange={(nextStatus) => resetToFirstPage(() => setStatus(nextStatus))}
          onToggleMore={() => setMoreOpen((open) => !open)}
          onUploadedFromChange={(nextUploadedFrom) => resetToFirstPage(() => setUploadedFrom(nextUploadedFrom))}
          onUploadedToChange={(nextUploadedTo) => resetToFirstPage(() => setUploadedTo(nextUploadedTo))}
          onUploadClick={openUploadModal}
          onUploaderIdChange={(nextUploaderId) => resetToFirstPage(() => setUploaderId(nextUploaderId))}
        />

        <BatchActionBar
          selectedCount={selectedIds.length}
          onArchive={scope === "archive" ? undefined : () => void runBatch("ARCHIVE")}
          onClear={() => setSelectedIds([])}
          onDelete={() => void runBatch("DELETE")}
          onDownload={() => void runBatch("DOWNLOAD")}
          onMove={scope === "archive" ? undefined : () => void runBatch("MOVE")}
          onPermissions={scope === "archive" ? undefined : openBatchPermission}
          onRestore={scope === "archive" ? () => void runBatch("RESTORE") : undefined}
        />

        <DocumentTable
          documents={docs}
          loading={loading}
          page={page}
          pageSize={PAGE_SIZE}
          selectedIds={selectedIds}
          total={total}
          onDelete={(doc) => void removeDoc(doc)}
          onDownload={downloadDocument}
          onEdit={setEditDoc}
          onPageChange={setPage}
          onPermissions={openSinglePermission}
          onRetryParse={(doc) => void retryParse(doc)}
          onRestore={scope === "archive" ? (doc) => void restoreDoc(doc) : undefined}
          onToggle={toggleSelected}
          onToggleAll={toggleAllVisible}
          onView={viewDocument}
          onViewChunks={IS_DEV ? (doc) => void openDetail(doc.id) : undefined}
          isArchive={scope === "archive"}
        />
      </main>

      {showUploadModal && (
        <UploadModal
          folders={folders}
          results={uploadResults}
          uploading={uploading}
          onClose={closeUploadModal}
          onUpload={(files, folderId) => uploadFiles(files, folderId)}
        />
      )}

      {editDoc && (
        <EditDocModal
          doc={editDoc}
          folders={folders}
          onClose={() => setEditDoc(null)}
          onSave={(data) => handleEditDoc(editDoc.id, data)}
        />
      )}

      <PermissionModal
        open={Boolean(permissionTarget)}
        saving={permissionSaving}
        target={permissionTarget}
        onClose={() => setPermissionTarget(null)}
        onSave={savePermissions}
      />

      {showManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6" onClick={() => setShowManager(false)}>
          <div className="flex max-h-[80vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="font-semibold">管理文件夹</h3>
              <button className="grid h-7 w-7 place-items-center rounded text-slate-500 hover:bg-slate-100" onClick={() => setShowManager(false)} type="button">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <FolderTagManager onFoldersChange={fetchFolders} />
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6" onClick={() => setDetail(null)}>
          <div className="flex max-h-[80vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="font-semibold">{detail.title}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {detail.chunks.length} 个片段 · 共{" "}
                  {detail.chunks.reduce((sum, chunk) => sum + (chunk.tokens || 0), 0)} tokens ·{" "}
                  {formatBytes(detail.size)} · {detail.mime}
                </p>
              </div>
              <button className="grid h-7 w-7 place-items-center rounded text-slate-500 hover:bg-slate-100" onClick={() => setDetail(null)} type="button">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 overflow-y-auto p-6">
              {detail.errorMessage && (
                <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                  {detail.errorMessage}
                </div>
              )}
              {detailLoading ? (
                <div className="py-12 text-center text-slate-400">
                  <Loader2 className="mr-2 inline animate-spin" size={16} />
                  加载中
                </div>
              ) : detail.chunks.length === 0 ? (
                <div className="py-12 text-center text-slate-400">暂无切片内容</div>
              ) : (
                detail.chunks.map((chunk) => (
                  <div key={chunk.id} className="rounded border border-slate-200 p-3">
                    <div className="mb-1 text-xs text-slate-400">
                      #{chunk.idx} · {chunk.tokens} tokens
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{chunk.text}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

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

function normalizeDocument(doc: DocumentDto): DocumentDto {
  const raw = doc as Partial<DocumentDto>;
  return {
    ...doc,
    permissionScope: raw.permissionScope || "PRIVATE",
    searchable: raw.searchable ?? true,
    aiReferenceEnabled: raw.aiReferenceEnabled ?? true,
    archived: raw.archived ?? false,
    deletedAt: raw.deletedAt ?? null,
    canView: raw.canView ?? true,
    canDownload: raw.canDownload ?? true,
    canEdit: raw.canEdit ?? true,
    canDelete: raw.canDelete ?? true,
    canManagePermission: raw.canManagePermission ?? true,
  };
}

function resolveArchivedQuery(scope: DocumentScope) {
  if (scope === "archive") return true;
  return undefined;
}

function showApiError(error: unknown) {
  if (error instanceof ApiError) {
    toast.error(error.message);
    return;
  }
  toast.error("操作失败，请稍后重试");
}

function flattenFolders(folders: Folder[], depth = 0): Array<Folder & { depth: number }> {
  const result: Array<Folder & { depth: number }> = [];
  for (const folder of folders) {
    result.push({ ...folder, depth });
    if (folder.children?.length) {
      result.push(...flattenFolders(folder.children, depth + 1));
    }
  }
  return result;
}

function UploadModal({
  folders,
  onClose,
  onUpload,
  uploading,
  results,
}: {
  folders: Folder[];
  onClose: () => void;
  onUpload: (files: File[], folderId?: string) => void;
  uploading: boolean;
  results: DocumentBatchUploadResult[];
}) {
  const [selectedFolder, setSelectedFolder] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const flatFolders = flattenFolders(folders);
  const succeeded = results.filter((result) => result.ok).length;
  const failed = results.length - succeeded;

  function chooseFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const incomingFiles = Array.from(files);
    setSelectedFiles((current) => mergeUploadFiles(current, incomingFiles));
    if (fileRef.current) {
      fileRef.current.value = "";
    }
  }

  function removeSelectedFile(fileToRemove: File) {
    const keyToRemove = uploadFileKey(fileToRemove);
    setSelectedFiles((current) => current.filter((file) => uploadFileKey(file) !== keyToRemove));
  }

  function submitUpload() {
    if (selectedFiles.length === 0) return;
    onUpload(selectedFiles, selectedFolder || undefined);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-md flex-col rounded-lg bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="font-semibold">批量上传</h3>
          <button className="grid h-7 w-7 place-items-center rounded text-slate-500 hover:bg-slate-100" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">上传到文件夹</label>
            <select className="input w-full" value={selectedFolder} onChange={(event) => setSelectedFolder(event.target.value)}>
              <option value="">根目录</option>
              {flatFolders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {"　".repeat(folder.depth)}
                  {folder.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">选择文件</label>
            <input
              ref={fileRef}
              accept={SUPPORTED_UPLOAD_ACCEPT}
              className="hidden"
              multiple
              onChange={(event) => chooseFiles(event.target.files)}
              type="file"
            />
            <button
              className="flex w-full flex-col items-center justify-center gap-2 rounded border border-dashed border-slate-300 px-4 py-8 text-center hover:bg-slate-50 disabled:opacity-60"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              type="button"
            >
              <Upload size={24} className="text-slate-400" />
              <span className="text-sm text-slate-600">点击选择文件</span>
              <span className="text-xs text-slate-400">支持 PDF、Markdown、Office、TXT、图片 OCR、音频/音视频文件</span>
            </button>
          </div>

          {selectedFiles.length > 0 && (
            <div className="rounded border border-slate-200">
              <div className="flex h-9 items-center justify-between border-b border-slate-100 px-3 text-xs text-slate-500">
                <span>已选择 {selectedFiles.length} 个文件</span>
                <button className="text-brand-600 hover:underline" disabled={uploading} onClick={() => fileRef.current?.click()} type="button">
                  继续添加
                </button>
              </div>
              <div className="max-h-36 overflow-y-auto">
                {selectedFiles.map((file) => (
                  <div key={uploadFileKey(file)} className="flex items-center justify-between gap-3 border-b border-slate-50 px-3 py-2 text-xs last:border-b-0">
                    <span className="min-w-0 truncate text-slate-700">{file.name}</span>
                    <span className="flex shrink-0 items-center gap-2 text-slate-400">
                      {formatBytes(file.size)}
                      <button
                        aria-label={`移除 ${file.name}`}
                        className="grid h-5 w-5 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                        disabled={uploading}
                        onClick={() => removeSelectedFile(file)}
                        type="button"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div className="rounded border border-slate-200">
              <div className="flex h-9 items-center justify-between border-b border-slate-100 px-3 text-xs text-slate-500">
                <span>
                  上传结果：成功 {succeeded} 个，失败 {failed} 个
                </span>
              </div>
              <div className="max-h-40 overflow-y-auto">
                {results.map((result) => (
                  <div key={`${result.fileName}-${result.documentId || result.message || "result"}`} className="border-b border-slate-50 px-3 py-2 text-xs last:border-b-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-slate-700">{result.fileName}</span>
                      <span className={result.ok ? "shrink-0 text-emerald-600" : "shrink-0 text-rose-600"}>
                        {result.ok ? "成功" : "失败"}
                      </span>
                    </div>
                    {result.message && <div className="mt-1 truncate text-slate-400">{result.message}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button className="h-8 rounded border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50" onClick={onClose} type="button">
            取消
          </button>
          <button
            className="inline-flex h-8 items-center gap-1 rounded bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            disabled={uploading || selectedFiles.length === 0}
            onClick={submitUpload}
            type="button"
          >
            {uploading && <Loader2 size={14} className="animate-spin" />}
            开始上传
          </button>
        </div>
      </div>
    </div>
  );
}

function EditDocModal({
  doc,
  folders,
  onClose,
  onSave,
}: {
  doc: DocumentDto;
  folders: Folder[];
  onClose: () => void;
  onSave: (data: { title?: string; folderId?: string | null }) => void;
}) {
  const [title, setTitle] = useState(doc.title);
  const [folderId, setFolderId] = useState(doc.folderId || "");
  const [saving, setSaving] = useState(false);
  const flatFolders = flattenFolders(folders);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ title, folderId: folderId || null });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="font-semibold">编辑文档</h3>
          <button className="grid h-7 w-7 place-items-center rounded text-slate-500 hover:bg-slate-100" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4 p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">文档标题</label>
            <input className="input w-full" value={title} onChange={(event) => setTitle(event.target.value)} type="text" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">文件夹</label>
            <select className="input w-full" value={folderId} onChange={(event) => setFolderId(event.target.value)}>
              <option value="">根目录</option>
              {flatFolders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {"　".repeat(folder.depth)}
                  {folder.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button className="h-8 rounded border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50" onClick={onClose} type="button">
            取消
          </button>
          <button className="inline-flex h-8 items-center gap-1 rounded bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60" disabled={saving} onClick={handleSave} type="button">
            {saving && <Loader2 size={14} className="animate-spin" />}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
