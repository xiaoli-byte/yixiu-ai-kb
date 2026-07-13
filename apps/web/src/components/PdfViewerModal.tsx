"use client";
import { useEffect, useId, useRef, useState, useCallback } from "react";
import {
  X,
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
  canDownload?: boolean;
  onClose: () => void;
}

interface PdfPageSize {
  width: number;
  height: number;
}

export default function PdfViewerModal({
  documentId,
  title,
  initialPage,
  canDownload = true,
  onClose,
}: PdfViewerProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(initialPage ?? 1);
  const [pageSizes, setPageSizes] = useState<PdfPageSize[]>([]);
  const [scale, setScale] = useState(1.2);
  const [downloading, setDownloading] = useState(false);
  const titleId = useId();

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const pdfDocRef = useRef<any>(null);
  const initialPositionDoneRef = useRef(false);
  const previousScaleRef = useRef(scale);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNumPages(0);
    setPageSizes([]);
    initialPositionDoneRef.current = false;
    qaApi.getDocumentFileBlob(documentId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message || "获取文件失败");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
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

  const handleDownload = async () => {
    if (!canDownload || downloading) return;
    setDownloading(true);
    try {
      const blob = await qaApi.getDocumentFileBlob(documentId, { download: true });
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
        // Next.js serves public assets below the configured base path (for
        // example, /knowledge), so the worker URL must include it as well.
        const basePath = process.env.NEXT_PUBLIC_WEB_BASE_PATH || "";
        pdfjsLib.GlobalWorkerOptions.workerSrc = `${window.location.origin}${basePath}/pdf.worker.min.mjs`;
        const pdf = await pdfjsLib.getDocument({
          url: pdfUrl,
        }).promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        const sizes = await Promise.all(
          Array.from({ length: pdf.numPages }, async (_, index) => {
            const pageObj = await pdf.getPage(index + 1);
            const viewport = pageObj.getViewport({ scale: 1 });
            return { width: viewport.width, height: viewport.height };
          }),
        );
        if (cancelled) return;
        setNumPages(pdf.numPages);
        setPageSizes(sizes);
        setPage(Math.min(Math.max(initialPage ?? 1, 1), pdf.numPages));
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "PDF 加载失败");
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
      const pdf = pdfDocRef.current;
      pdfDocRef.current = null;
      if (pdf && typeof pdf.destroy === "function") {
        void Promise.resolve(pdf.destroy()).catch(() => {
          // The document may already have been destroyed during an effect
          // transition; cleanup should never surface an unhandled error.
        });
      }
    };
  }, [initialPage, pdfUrl]);

  const scrollToPage = useCallback((pageNumber: number) => {
    const container = containerRef.current;
    const target = pageRefs.current.get(pageNumber);
    if (!container || !target) return false;
    const top = container.scrollTop
      + target.getBoundingClientRect().top
      - container.getBoundingClientRect().top
      - 16;
    container.scrollTo({ top: Math.max(0, top) });
    return true;
  }, []);

  useEffect(() => {
    if (pageSizes.length === 0 || initialPositionDoneRef.current) return;
    const targetPage = Math.min(Math.max(initialPage ?? 1, 1), pageSizes.length);
    initialPositionDoneRef.current = scrollToPage(targetPage);
  }, [initialPage, pageSizes, scrollToPage]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || pageSizes.length === 0) return;

    const ratios = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNumber = Number((entry.target as HTMLElement).dataset.page);
          if (entry.isIntersecting) ratios.set(pageNumber, entry.intersectionRatio);
          else ratios.delete(pageNumber);
        }
        let visiblePage = page;
        let largestRatio = -1;
        for (const [pageNumber, ratio] of ratios) {
          if (ratio > largestRatio) {
            visiblePage = pageNumber;
            largestRatio = ratio;
          }
        }
        if (largestRatio >= 0) setPage(visiblePage);
      },
      { root: container, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
    );

    pageRefs.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [pageSizes]);

  useEffect(() => {
    if (previousScaleRef.current === scale) return;
    previousScaleRef.current = scale;
    requestAnimationFrame(() => {
      scrollToPage(page);
    });
  }, [page, scale, scrollToPage]);
  const zoomIn = useCallback(
    () => setScale((s) => Math.min(s + 0.3, 3)),
    [],
  );
  const zoomOut = useCallback(
    () => setScale((s) => Math.max(s - 0.3, 0.5)),
    [],
  );

  return (
    <div aria-labelledby={titleId} aria-modal="true" className="fixed inset-0 z-[100] flex" onClick={onClose} role="dialog">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative m-auto w-full max-w-4xl h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
      >
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 shrink-0">
          <FileText size={18} className="text-red-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate" id={titleId}>{title}</div>
            <div className="text-xs text-slate-400">
              {numPages > 0 ? `${numPages} 页` : "PDF 文档"}
            </div>
          </div>
          {pdfUrl && canDownload && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="btn-ghost p-2 text-slate-500 hover:text-brand-600 disabled:opacity-50"
              title="下载文件"
            >
              {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            </button>
          )}
          <button aria-label="关闭 PDF 预览" className="btn-ghost p-1.5" onClick={onClose} ref={closeButtonRef}>
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
                className="flex-1 overflow-auto bg-slate-100 px-4 py-5"
              >
                <div className="flex min-w-max flex-col items-center gap-5">
                  {pageSizes.map((size, index) => {
                    const pageNumber = index + 1;
                    return (
                      <div
                        aria-label={`第 ${pageNumber} 页`}
                        className="relative shrink-0 overflow-hidden bg-white shadow-lg ring-1 ring-slate-900/5"
                        data-page={pageNumber}
                        key={pageNumber}
                        ref={(element) => {
                          if (element) pageRefs.current.set(pageNumber, element);
                          else pageRefs.current.delete(pageNumber);
                        }}
                        style={{ width: size.width * scale, height: size.height * scale }}
                      >
                        <PdfPageCanvas
                          pdf={pdfDocRef.current}
                          pageNumber={pageNumber}
                          rootRef={containerRef}
                          scale={scale}
                          size={size}
                        />
                        <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-slate-900/55 px-1.5 py-0.5 text-[10px] text-white/90">
                          {pageNumber}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="shrink-0 px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-white">
                <div className="flex items-center gap-2" aria-live="polite">
                  <span className="text-sm tabular-nums text-slate-600 min-w-[80px]">
                    {page} / {numPages}
                  </span>
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

function PdfPageCanvas({
  pdf,
  pageNumber,
  rootRef,
  scale,
  size,
}: {
  pdf: any;
  pageNumber: number;
  rootRef: React.RefObject<HTMLDivElement>;
  scale: number;
  size: PdfPageSize;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { root, rootMargin: "100% 0px" },
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [rootRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!pdf || !canvas || !shouldRender) return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    void pdf.getPage(pageNumber).then((pageObj: any) => {
      if (cancelled) return;
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pageObj.getViewport({ scale: scale * outputScale });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${size.width * scale}px`;
      canvas.style.height = `${size.height * scale}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      const task = pageObj.render({ canvasContext: context, viewport });
      renderTask = task;
      return task.promise;
    }).catch((error: { name?: string }) => {
      if (!cancelled && error?.name !== "RenderingCancelledException") {
        console.error(`PDF page ${pageNumber} render failed`, error);
      }
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pageNumber, pdf, scale, shouldRender, size.height, size.width]);

  return (
    <canvas
      className="block bg-white"
      ref={canvasRef}
      style={{ width: size.width * scale, height: size.height * scale }}
    />
  );
}
