"use client";
// 统一文档预览入口：按文件类型分发渲染方式，避免「所有文件都按 PDF 渲染」的错误。
// PDF → pdf.js 弹窗；Markdown → MD 渲染弹窗；图片/音视频/纯文本 → 本组件自绘预览；
// Office 等浏览器无法原生渲染的类型 → 展示解析文本（切片拼接），无解析内容时给下载引导；
// 图片/音视频另提供「查看 OCR / 转写文本」切换。
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  X,
  Download,
  Loader2,
  AlertCircle,
  FileQuestion,
  FileText,
  Undo2,
} from "lucide-react";
import qaApi from "@/services/qa";
import PdfViewerModal from "@/components/PdfViewerModal";
import MarkdownPreviewModal from "@/components/MarkdownPreviewModal";
import { getFilePreviewKind, getFileBadge, type FilePreviewKind } from "@/lib/file-preview";

export interface DocumentPreviewModalProps {
  documentId: string;
  title: string;
  /** 文档 MIME 类型；缺省时按标题扩展名判断 */
  mime?: string | null;
  /** 仅 PDF 生效：初始定位页码 */
  initialPage?: number;
  canDownload?: boolean;
  onClose: () => void;
}

export default function DocumentPreviewModal({
  documentId,
  title,
  mime,
  initialPage,
  canDownload = true,
  onClose,
}: DocumentPreviewModalProps) {
  const kind = getFilePreviewKind(mime, title);

  if (kind === "pdf") {
    return (
      <PdfViewerModal
        documentId={documentId}
        title={title}
        initialPage={initialPage}
        canDownload={canDownload}
        onClose={onClose}
      />
    );
  }

  if (kind === "markdown") {
    return (
      <MarkdownPreviewModal
        documentId={documentId}
        title={title}
        canDownload={canDownload}
        onClose={onClose}
      />
    );
  }

  return (
    <MediaPreviewModal
      documentId={documentId}
      title={title}
      kind={kind}
      mime={mime}
      canDownload={canDownload}
      onClose={onClose}
    />
  );
}

const KIND_SUBTITLE: Record<Exclude<FilePreviewKind, "pdf" | "markdown">, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
  text: "文本文档",
  office: "Office 文档",
  unknown: "文件",
};

/** 各类型「解析文本」的称谓：Office 是解析正文，图片是 OCR，音视频是语音转写 */
const PARSED_TEXT_LABEL: Record<Exclude<FilePreviewKind, "pdf" | "markdown">, string> = {
  image: "OCR 识别文本",
  video: "语音转写文本",
  audio: "语音转写文本",
  text: "解析文本",
  office: "解析文本",
  unknown: "解析文本",
};

// 纯文本预览最多读取 1MB，避免超大文件撑爆 DOM
const TEXT_PREVIEW_MAX_BYTES = 1024 * 1024;

function MediaPreviewModal({
  documentId,
  title,
  kind,
  mime,
  canDownload,
  onClose,
}: {
  documentId: string;
  title: string;
  kind: Exclude<FilePreviewKind, "pdf" | "markdown">;
  mime?: string | null;
  canDownload: boolean;
  onClose: () => void;
}) {
  // Office/未知类型浏览器无法原生渲染，不拉取原始文件，改走解析文本
  const loadable = kind === "image" || kind === "video" || kind === "audio" || kind === "text";
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textTruncated, setTextTruncated] = useState(false);
  const [loading, setLoading] = useState(loadable);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  // 解析文本（Office 正文 / 图片 OCR / 音视频转写）：媒体类型点击切换时懒加载
  const [showParsedText, setShowParsedText] = useState(false);
  const [parsedText, setParsedText] = useState<{ content: string; truncated: boolean } | null>(null);
  const [parsedLoading, setParsedLoading] = useState(false);
  const [parsedError, setParsedError] = useState<string | null>(null);
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // 解析文本请求序号：切换文档时自增，作废在途请求的 setState
  const parsedReqSeq = useRef(0);
  const badge = getFileBadge(mime, title);

  const loadParsedText = useCallback(() => {
    const seq = ++parsedReqSeq.current;
    setParsedLoading(true);
    setParsedError(null);
    qaApi.getDocumentParsedContent(documentId)
      .then((data) => {
        if (seq !== parsedReqSeq.current) return;
        setParsedText({ content: data?.content || "", truncated: data?.truncated || false });
      })
      .catch((e) => {
        if (seq !== parsedReqSeq.current) return;
        setParsedError(e?.message || "获取解析文本失败");
      })
      .finally(() => {
        if (seq === parsedReqSeq.current) setParsedLoading(false);
      });
  }, [documentId]);

  useEffect(() => {
    // 组件实例可能在不关闭弹窗的情况下切换文档（连续点击不同引用），先重置全部状态
    setError(null);
    setObjectUrl(null);
    setTextContent(null);
    setTextTruncated(false);
    setShowParsedText(false);
    setParsedText(null);
    setParsedError(null);
    setParsedLoading(false);
    parsedReqSeq.current += 1;
    // Office/未知类型：解析文本就是主体内容，挂载即加载；媒体类型点击切换时再懒加载
    if (kind === "office" || kind === "unknown") {
      loadParsedText();
    }
    if (!loadable) {
      setLoading(false);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    setLoading(true);
    qaApi.getDocumentFileBlob(documentId)
      .then(async (blob) => {
        if (cancelled) return;
        if (kind === "text") {
          const truncated = blob.size > TEXT_PREVIEW_MAX_BYTES;
          const text = await blob.slice(0, TEXT_PREVIEW_MAX_BYTES).text();
          if (cancelled) return;
          setTextContent(text);
          setTextTruncated(truncated);
        } else {
          url = URL.createObjectURL(blob);
          setObjectUrl(url);
        }
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message || "获取文件失败");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [documentId, kind, loadable, loadParsedText]);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), audio[controls], video[controls], [tabindex]:not([tabindex="-1"])',
          ),
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleDownload = async () => {
    if (!canDownload || downloading) return;
    setDownloading(true);
    try {
      const blob = await qaApi.getDocumentFileBlob(documentId, { download: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = title;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Download failed:", e);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div aria-labelledby={titleId} aria-modal="true" className="fixed inset-0 z-[100] flex" onClick={onClose} role="dialog">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative m-auto w-full max-w-4xl h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 shrink-0">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white ${badge.tone}`}>
            {badge.text}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate" id={titleId}>{title}</div>
            <div className="text-xs text-slate-400">{KIND_SUBTITLE[kind]}</div>
          </div>
          {(kind === "image" || kind === "video" || kind === "audio") && !loading && !error && (
            <button
              className="btn-ghost flex items-center gap-1 px-2 py-1.5 text-xs text-slate-500 hover:text-brand-600"
              onClick={() => {
                const next = !showParsedText;
                setShowParsedText(next);
                if (next && !parsedText && !parsedLoading) loadParsedText();
              }}
              title={showParsedText ? "返回预览" : `查看${PARSED_TEXT_LABEL[kind]}`}
            >
              {showParsedText ? <Undo2 size={14} /> : <FileText size={14} />}
              {showParsedText ? "返回预览" : PARSED_TEXT_LABEL[kind]}
            </button>
          )}
          {canDownload && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="btn-ghost p-2 text-slate-500 hover:text-brand-600 disabled:opacity-50"
              title="下载文件"
            >
              {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            </button>
          )}
          <button aria-label="关闭预览" className="btn-ghost p-1.5" onClick={onClose} ref={closeButtonRef}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {loading && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Loader2 size={32} className="animate-spin mx-auto mb-3 text-brand-500" />
                <p className="text-sm text-slate-500">加载中...</p>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <AlertCircle size={32} className="mx-auto mb-3 text-red-400" />
                <p className="text-sm text-red-500">{error}</p>
              </div>
            </div>
          )}

          {/* 解析文本视图：office/unknown 的主体内容；图片/音视频切换后展示 OCR/转写 */}
          {!loading && !error && (kind === "office" || kind === "unknown" || showParsedText) && (
            <div className="flex-1 overflow-auto">
              {parsedLoading && (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <Loader2 size={32} className="animate-spin mx-auto mb-3 text-brand-500" />
                    <p className="text-sm text-slate-500">加载{PARSED_TEXT_LABEL[kind]}...</p>
                  </div>
                </div>
              )}
              {!parsedLoading && parsedError && (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <AlertCircle size={32} className="mx-auto mb-3 text-red-400" />
                    <p className="text-sm text-red-500">{parsedError}</p>
                    <button className="btn-ghost mt-3 text-xs text-brand-600" onClick={loadParsedText}>
                      重试
                    </button>
                  </div>
                </div>
              )}
              {!parsedLoading && !parsedError && parsedText && parsedText.content.trim() && (
                <>
                  <div className="border-b border-slate-100 bg-slate-50 px-5 py-2 text-xs text-slate-500">
                    {kind === "office" || kind === "unknown"
                      ? "原格式暂不支持在线预览，以下为系统解析出的正文内容"
                      : `以下为系统自动生成的${PARSED_TEXT_LABEL[kind]}，仅供参考`}
                    {parsedText.truncated && " · 内容过长已截断，完整内容请下载原文件"}
                  </div>
                  <pre className="whitespace-pre-wrap break-words p-5 font-mono text-xs leading-5 text-slate-700">
                    {parsedText.content}
                  </pre>
                </>
              )}
              {!parsedLoading && !parsedError && parsedText && !parsedText.content.trim() && (
                <div className="flex h-full items-center justify-center p-6">
                  <div className="text-center">
                    <FileQuestion size={40} className="mx-auto mb-3 text-slate-300" />
                    <p className="text-sm font-medium text-slate-600">
                      暂无{PARSED_TEXT_LABEL[kind]}（文档可能尚未解析完成）
                    </p>
                    {(kind === "office" || kind === "unknown") &&
                      (canDownload ? (
                        <button
                          className="btn-primary mt-4 inline-flex items-center gap-1.5 text-sm"
                          disabled={downloading}
                          onClick={handleDownload}
                        >
                          {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                          下载查看
                        </button>
                      ) : (
                        <p className="mt-2 text-xs text-slate-400">你没有下载此文档的权限</p>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!loading && !error && !showParsedText && kind === "image" && objectUrl && (
            <div className="flex-1 overflow-auto bg-slate-100 p-4">
              <div className="flex min-h-full items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- 预览受保护的 blob 地址，无法使用 next/image */}
                <img
                  alt={title}
                  className="max-h-full max-w-full rounded bg-white object-contain shadow-lg ring-1 ring-slate-900/5"
                  onError={() => setError("图片加载失败")}
                  src={objectUrl}
                />
              </div>
            </div>
          )}

          {!loading && !error && !showParsedText && kind === "video" && objectUrl && (
            <div className="flex-1 flex items-center justify-center bg-slate-950 p-4">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption -- 原始文档无字幕轨 */}
              <video
                className="max-h-full max-w-full"
                controls
                onError={() => setError("视频加载失败，可能是浏览器不支持该编码格式，请下载后播放")}
                src={objectUrl}
              />
            </div>
          )}

          {/* 音频切到转写文本时仅隐藏不卸载：保持播放进度，支持边听边看文字稿 */}
          {!loading && !error && kind === "audio" && objectUrl && (
            <div className={showParsedText ? "hidden" : "flex-1 flex items-center justify-center p-6"}>
              <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                <span className={`mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl text-xs font-bold text-white ${badge.tone}`}>
                  {badge.text}
                </span>
                <p className="mb-4 truncate text-sm font-medium text-slate-700">{title}</p>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption -- 原始文档无字幕轨 */}
                <audio
                  className="w-full"
                  controls
                  onError={() => setError("音频加载失败，可能是浏览器不支持该编码格式，请下载后播放")}
                  src={objectUrl}
                />
              </div>
            </div>
          )}

          {!loading && !error && kind === "text" && textContent !== null && (
            <div className="flex-1 overflow-auto">
              {textTruncated && (
                <div className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-700">
                  文件较大，仅显示前 1MB 内容，完整内容请下载查看
                </div>
              )}
              <pre className="whitespace-pre-wrap break-words p-5 font-mono text-xs leading-5 text-slate-700">
                {textContent}
              </pre>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
