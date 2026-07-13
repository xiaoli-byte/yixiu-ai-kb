"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  X,
  FileText,
  Download,
  Loader2,
  AlertCircle,
  Copy,
  Check,
} from "lucide-react";
import qaApi from "@/services/qa";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownPreviewModalProps {
  documentId: string;
  title: string;
  canDownload?: boolean;
  onClose: () => void;
}

export default function MarkdownPreviewModal({
  documentId,
  title,
  canDownload = true,
  onClose,
}: MarkdownPreviewModalProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    qaApi.getDocumentMarkdown(documentId)
      .then((data) => setContent(data?.content || ""))
      .catch((e) => setError(e?.message || "获取文件失败"))
      .finally(() => setLoading(false));
  }, [documentId]);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (!content) return;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = title.endsWith(".md") ? title : `${title}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
          <FileText size={18} className="text-blue-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate" id={titleId}>{title}</div>
            <div className="text-xs text-slate-400">Markdown 文档</div>
          </div>
          {content && canDownload && (
            <>
              <button
                onClick={handleCopy}
                className="btn-ghost p-2 text-slate-500 hover:text-brand-600"
                title="复制内容"
              >
                {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
              </button>
              <button
                onClick={handleDownload}
                className="btn-ghost p-2 text-slate-500 hover:text-brand-600"
                title="下载文件"
              >
                <Download size={16} />
              </button>
            </>
          )}
          <button aria-label="关闭 Markdown 预览" className="btn-ghost p-1.5" onClick={onClose} ref={closeButtonRef}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {loading && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Loader2
                  size={32}
                  className="animate-spin mx-auto mb-3 text-brand-500"
                />
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

          {!loading && !error && content && (
            <div className="flex-1 overflow-auto">
              <article className="prose prose-slate max-w-none p-6 lg:p-8
                prose-headings:font-semibold prose-headings:text-slate-800
                prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
                prose-p:text-slate-700 prose-p:leading-relaxed
                prose-a:text-brand-600 prose-a:no-underline hover:prose-a:underline
                prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-slate-800 prose-pre:text-slate-100 prose-pre:rounded-lg
                prose-ul:my-2 prose-ol:my-2
                prose-li:text-slate-700
                prose-table:text-sm
                prose-th:bg-slate-100 prose-th:px-3 prose-th:py-2
                prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-slate-200
                prose-blockquote:border-l-brand-500 prose-blockquote:text-slate-600
              ">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
              </article>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
