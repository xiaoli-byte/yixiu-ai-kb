// 前端文件预览分类：与后端 apps/api/src/modules/documents/document-file-types.ts 的
// 支持范围保持对齐，但按「浏览器渲染方式」细分——后端把视频归入 audio（都走 FunASR 转写），
// 前端预览必须区分 video/audio；markdown 与普通文本渲染方式不同，也需要拆开。
// 两侧扩展名/MIME 集合如有增减，须同步修改。

export type FilePreviewKind =
  | "pdf"
  | "office"
  | "markdown"
  | "text"
  | "image"
  | "video"
  | "audio"
  | "unknown";

const OFFICE_WORD_EXTS = [".docx", ".doc", ".docm"];
const OFFICE_EXCEL_EXTS = [".xlsx", ".xls", ".xlsm"];
const OFFICE_PPT_EXTS = [".pptx", ".ppt", ".pptm"];

const MARKDOWN_EXTS = [".md", ".markdown"];

const TEXT_EXTS = [
  ".txt",
  ".text",
  ".csv",
  ".tsv",
  ".json",
  ".jsonl",
  ".log",
  ".xml",
  ".html",
  ".htm",
  ".yaml",
  ".yml",
];

// .webm/.ogg 既可能是音频也可能是视频：MIME 可信时以 MIME 为准，
// 仅有扩展名时归 video——<video> 标签可以正常播放纯音频流，反之不行。
const VIDEO_EXTS = [".mp4", ".mov", ".mkv", ".webm"];

const AUDIO_EXTS = [
  ".wav",
  ".mp3",
  ".m4a",
  ".aac",
  ".flac",
  ".ogg",
  ".opus",
  ".amr",
  ".wma",
];

const IMAGE_EXTS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".jpe",
  ".jfif",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
];

const OFFICE_MIME_HINTS = [
  "word",
  "excel",
  "sheet",
  "powerpoint",
  "presentation",
];

const TEXT_MIMES = [
  "application/json",
  "application/ld+json",
  "application/x-ndjson",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
];

export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : "";
}

/** 判断文档在前端应使用哪种预览方式（mime 优先，扩展名兜底） */
export function getFilePreviewKind(
  mime: string | null | undefined,
  filename: string,
): FilePreviewKind {
  const normalizedMime = (mime || "").toLowerCase();
  const ext = getFileExtension(filename || "");

  if (normalizedMime === "application/pdf" || ext === ".pdf") return "pdf";

  if (
    normalizedMime.includes("markdown") ||
    MARKDOWN_EXTS.includes(ext)
  ) {
    return "markdown";
  }

  // 已知文本扩展名优先于 Office MIME：Windows 装有 Excel 时浏览器常把 .csv/.tsv
  // 上报为 application/vnd.ms-excel，按 MIME 会误判为 Office 而失去文本预览
  if (TEXT_EXTS.includes(ext)) {
    return "text";
  }

  if (
    OFFICE_MIME_HINTS.some((hint) => normalizedMime.includes(hint)) ||
    OFFICE_WORD_EXTS.includes(ext) ||
    OFFICE_EXCEL_EXTS.includes(ext) ||
    OFFICE_PPT_EXTS.includes(ext)
  ) {
    return "office";
  }

  if (normalizedMime.startsWith("image/") || IMAGE_EXTS.includes(ext)) {
    return "image";
  }

  if (normalizedMime.startsWith("video/")) return "video";
  if (normalizedMime.startsWith("audio/")) return "audio";
  if (VIDEO_EXTS.includes(ext)) return "video";
  if (AUDIO_EXTS.includes(ext)) return "audio";

  if (
    normalizedMime.startsWith("text/") ||
    TEXT_MIMES.includes(normalizedMime) ||
    TEXT_EXTS.includes(ext)
  ) {
    return "text";
  }

  return "unknown";
}

export type FileTypeLabel =
  | "PDF"
  | "DOCX"
  | "XLSX"
  | "PPTX"
  | "MD"
  | "TXT"
  | "IMG"
  | "VIDEO"
  | "AUDIO"
  | "FILE";

/** 文件类型标签：用于列表徽标 / 筛选展示（office 按具体套件细分） */
export function getFileTypeLabel(
  mime: string | null | undefined,
  filename: string,
): FileTypeLabel {
  const kind = getFilePreviewKind(mime, filename);
  if (kind === "office") {
    const normalizedMime = (mime || "").toLowerCase();
    const ext = getFileExtension(filename || "");
    if (
      normalizedMime.includes("excel") ||
      normalizedMime.includes("sheet") ||
      OFFICE_EXCEL_EXTS.includes(ext)
    ) {
      return "XLSX";
    }
    if (
      normalizedMime.includes("powerpoint") ||
      normalizedMime.includes("presentation") ||
      OFFICE_PPT_EXTS.includes(ext)
    ) {
      return "PPTX";
    }
    return "DOCX";
  }
  const map: Record<Exclude<FilePreviewKind, "office">, FileTypeLabel> = {
    pdf: "PDF",
    markdown: "MD",
    text: "TXT",
    image: "IMG",
    video: "VIDEO",
    audio: "AUDIO",
    unknown: "FILE",
  };
  return map[kind];
}

export interface FileBadge {
  label: FileTypeLabel;
  /** 徽标短文字（实色底上的白字） */
  text: string;
  /** 徽标底色 class（与检索结果页同一套语义色） */
  tone: string;
}

const BADGE_TEXT: Record<FileTypeLabel, string> = {
  PDF: "PDF",
  DOCX: "W",
  XLSX: "X",
  PPTX: "P",
  MD: "MD",
  TXT: "TXT",
  IMG: "IMG",
  VIDEO: "VID",
  AUDIO: "AUD",
  FILE: "DOC",
};

const BADGE_TONE: Record<FileTypeLabel, string> = {
  PDF: "bg-rose-500",
  DOCX: "bg-blue-500",
  XLSX: "bg-emerald-500",
  PPTX: "bg-amber-500",
  MD: "bg-slate-500",
  TXT: "bg-sky-500",
  IMG: "bg-purple-500",
  VIDEO: "bg-indigo-500",
  AUDIO: "bg-pink-500",
  FILE: "bg-slate-400",
};

/** 文件徽标（颜色 + 短文字），QA 引用卡片 / 检索结果共用 */
export function getFileBadge(
  mime: string | null | undefined,
  filename: string,
): FileBadge {
  const label = getFileTypeLabel(mime, filename);
  return { label, text: BADGE_TEXT[label], tone: BADGE_TONE[label] };
}

export function badgeToneOfLabel(label: string): string {
  return BADGE_TONE[label as FileTypeLabel] || BADGE_TONE.FILE;
}

export function badgeTextOfLabel(label: string): string {
  return BADGE_TEXT[label as FileTypeLabel] || label;
}
