"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Loader2,
  AlertCircle,
  FileText,
  Download,
} from "lucide-react";
import qaApi from "@/services/qa";

interface PdfViewerProps {
  documentId: string;
  title: string;
  initialPage?: number;
  onClose: () => void;
}

export default function PdfViewerModal({
  documentId,
  title,
  initialPage,
  onClose,
}: PdfViewerProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(initialPage ?? 1);
  const [scale, setScale] = useState(1.2);
  const [downloading, setDownloading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<any>(null);

  useEffect(() => {
    setLoading(true);
    qaApi.getDocumentPdfUrl(documentId)
      .then((data) => setPdfUrl(data?.url || null))
      .catch((e) => setError(e?.message || "获取文件失败"))
      .finally(() => setLoading(false));
  }, [documentId]);

  const handleDownload = async () => {
    if (!pdfUrl || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(pdfUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = title.endsWith(".pdf") ? title : `${title}.pdf`;
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

  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;

    const load = async () => {
      try {
        // v6 ESM: named export, workerSrc still required
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;
        const pdf = await pdfjsLib.getDocument({ url: pdfUrl }).promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "PDF 加载失败");
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  useEffect(() => {
    const pdf = pdfDocRef.current;
    if (!pdf || !canvasRef.current) return;

    const render = async () => {
      try {
        const pageObj = await pdf.getPage(page);
        const viewport = pageObj.getViewport({ scale });
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await pageObj.render({ canvasContext: ctx, viewport }).promise;
      } catch (e) {
        // ignore render errors on scale/page change
      }
    };

    render();
  }, [page, scale, numPages]);

  const prevPage = useCallback(
    () => setPage((p) => Math.max(1, p - 1)),
    [],
  );
  const nextPage = useCallback(
    () => setPage((p) => Math.min(numPages, p + 1)),
    [numPages],
  );
  const zoomIn = useCallback(
    () => setScale((s) => Math.min(s + 0.3, 3)),
    [],
  );
  const zoomOut = useCallback(
    () => setScale((s) => Math.max(s - 0.3, 0.5)),
    [],
  );

  return (
    <div className="fixed inset-0 z-[100] flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative m-auto w-full max-w-4xl h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 shrink-0">
          <FileText size={18} className="text-red-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{title}</div>
            <div className="text-xs text-slate-400">
              {numPages > 0 ? `${numPages} 页` : "PDF 文档"}
            </div>
          </div>
          {pdfUrl && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="btn-ghost p-2 text-slate-500 hover:text-brand-600 disabled:opacity-50"
              title="下载文件"
            >
              {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            </button>
          )}
          <button className="btn-ghost p-1.5" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {loading && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Loader2
                  size={32}
                  className="animate-spin mx-auto mb-3 text-brand-500"
                />
                <p className="text-sm text-slate-500">获取文件链接...</p>
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

          {!loading && !error && (
            <>
              <div
                ref={containerRef}
                className="flex-1 overflow-auto bg-slate-100 flex justify-center py-4"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  const pageHeight = el.scrollHeight / Math.max(numPages, 1);
                  const current = Math.floor(el.scrollTop / pageHeight) + 1;
                  if (
                    current !== page &&
                    current >= 1 &&
                    current <= numPages
                  ) {
                    setPage(current);
                  }
                }}
              >
                <div className="inline-block shadow-lg">
                  <canvas ref={canvasRef} className="block" />
                </div>
              </div>

              <div className="shrink-0 px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-white">
                <div className="flex items-center gap-2">
                  <button
                    className="btn-ghost p-1.5 disabled:opacity-30"
                    disabled={page <= 1}
                    onClick={prevPage}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm text-slate-600 min-w-[80px] text-center">
                    {page} / {numPages}
                  </span>
                  <button
                    className="btn-ghost p-1.5 disabled:opacity-30"
                    disabled={page >= numPages}
                    onClick={nextPage}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="btn-ghost p-1.5 disabled:opacity-30"
                    disabled={scale <= 0.5}
                    onClick={zoomOut}
                  >
                    <ZoomOut size={16} />
                  </button>
                  <span className="text-xs text-slate-500 min-w-[48px] text-center">
                    {Math.round(scale * 100)}%
                  </span>
                  <button
                    className="btn-ghost p-1.5 disabled:opacity-30"
                    disabled={scale >= 3}
                    onClick={zoomIn}
                  >
                    <ZoomIn size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
