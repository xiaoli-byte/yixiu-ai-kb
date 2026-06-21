import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

export function formatDate(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function statusColor(status: string) {
  switch (status) {
    case "READY":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "PENDING":
    case "PARSING":
    case "CHUNKING":
    case "EMBEDDING":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "FAILED":
      return "bg-rose-50 text-rose-700 ring-rose-200";
    default:
      return "bg-slate-50 text-slate-700 ring-slate-200";
  }
}

export function statusLabel(status: string) {
  const map: Record<string, string> = {
    PENDING: "等待中",
    PARSING: "解析中",
    CHUNKING: "切分中",
    EMBEDDING: "向量化",
    READY: "就绪",
    FAILED: "失败",
  };
  return map[status] || status;
}