"use client";
// 全局反馈基建：Toast（右上角自动消失）+ 确认弹窗（Promise 化，替代 window.confirm）
// 用法：toast.success("已保存") / await confirmDialog({ title: "确认删除？", danger: true })
// <FeedbackHost /> 挂载在 dashboard layout 一处即可
import { useEffect, useRef } from "react";
import { create } from "zustand";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** 破坏性操作：确认按钮红色强调 */
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve?: (ok: boolean) => void;
}

interface FeedbackStore {
  toasts: ToastItem[];
  confirm: ConfirmState;
  pushToast: (type: ToastType, message: string) => void;
  dismissToast: (id: number) => void;
  openConfirm: (opts: ConfirmOptions, resolve: (ok: boolean) => void) => void;
  settleConfirm: (ok: boolean) => void;
}

let toastSeq = 0;
const TOAST_DURATION = 4000;

const useFeedback = create<FeedbackStore>((set, get) => ({
  toasts: [],
  confirm: { open: false, title: "" },
  pushToast: (type, message) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
    setTimeout(() => get().dismissToast(id), TOAST_DURATION);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  openConfirm: (opts, resolve) => set({ confirm: { ...opts, open: true, resolve } }),
  settleConfirm: (ok) => {
    const { confirm } = get();
    confirm.resolve?.(ok);
    set({ confirm: { open: false, title: "" } });
  },
}));

export const toast = {
  success: (message: string) => useFeedback.getState().pushToast("success", message),
  error: (message: string) => useFeedback.getState().pushToast("error", message),
  info: (message: string) => useFeedback.getState().pushToast("info", message),
};

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useFeedback.getState().openConfirm(opts, resolve);
  });
}

const TOAST_META: Record<ToastType, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: "text-success" },
  error: { icon: AlertCircle, className: "text-destructive" },
  info: { icon: Info, className: "text-brand-600" },
};

function Toaster() {
  const toasts = useFeedback((s) => s.toasts);
  const dismiss = useFeedback((s) => s.dismissToast);

  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 top-4 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((t) => {
        const { icon: Icon, className } = TOAST_META[t.type];
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 shadow-raised"
          >
            <Icon size={16} className={cn("mt-0.5 shrink-0", className)} />
            <span className="min-w-0 flex-1 break-words leading-relaxed">{t.message}</span>
            <button
              aria-label="关闭提示"
              className="shrink-0 rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              onClick={() => dismiss(t.id)}
              type="button"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ConfirmModal() {
  const confirm = useFeedback((s) => s.confirm);
  const settle = useFeedback((s) => s.settleConfirm);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!confirm.open) return;
    confirmButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") settle(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirm.open, settle]);

  if (!confirm.open) return null;

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6"
      role="dialog"
      onClick={() => settle(false)}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-slate-900">{confirm.title}</h3>
        {confirm.description && (
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{confirm.description}</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="h-8 rounded-lg border border-slate-200 px-4 text-[13px] text-slate-700 transition hover:bg-slate-50"
            onClick={() => settle(false)}
            type="button"
          >
            {confirm.cancelText || "取消"}
          </button>
          <button
            ref={confirmButtonRef}
            className={cn(
              "h-8 rounded-lg px-4 text-[13px] font-medium text-white transition",
              confirm.danger ? "bg-destructive hover:bg-red-700" : "bg-brand-600 hover:bg-brand-700",
            )}
            onClick={() => settle(true)}
            type="button"
          >
            {confirm.confirmText || "确认"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FeedbackHost() {
  return (
    <>
      <Toaster />
      <ConfirmModal />
    </>
  );
}
