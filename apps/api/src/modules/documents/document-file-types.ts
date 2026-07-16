export type DocumentFileKind = "pdf" | "office" | "text" | "audio" | "image";

const PDF_EXTS = [".pdf"];

const OFFICE_EXTS = [
  ".docx",
  ".doc",
  ".docm",
  ".xlsx",
  ".xls",
  ".xlsm",
  ".pptx",
  ".ppt",
  ".pptm",
];

const TEXT_EXTS = [
  ".md",
  ".markdown",
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

const AUDIO_EXTS = [
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

const OFFICE_MIMES = [
  "application/msword",
  "application/vnd.ms-word.document.macroenabled.12",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.ms-powerpoint.presentation.macroenabled.12",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

const TEXT_MIMES = [
  "application/json",
  "application/ld+json",
  "application/x-ndjson",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
  "text/markdown",
];

const IMAGE_MIMES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/webp",
  "image/bmp",
  "image/x-ms-bmp",
  "image/tiff",
];

export const SUPPORTED_DOCUMENT_EXTENSIONS = [
  ...PDF_EXTS,
  ...OFFICE_EXTS,
  ...TEXT_EXTS,
  ...AUDIO_EXTS,
  ...IMAGE_EXTS,
];

export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : "";
}

export function getDocumentFileKind(mime: string | null | undefined, filename: string): DocumentFileKind | null {
  const normalizedMime = (mime || "").toLowerCase();
  const ext = getFileExtension(filename);

  if (normalizedMime === "application/pdf" || PDF_EXTS.includes(ext)) {
    return "pdf";
  }

  // 已知文本扩展名优先于 Office MIME：Windows 装有 Excel 时浏览器常把 .csv/.tsv
  // 上报为 application/vnd.ms-excel，按 MIME 会误入 Office 分支导致解析失败
  if (TEXT_EXTS.includes(ext)) {
    return "text";
  }

  if (OFFICE_MIMES.includes(normalizedMime) || OFFICE_EXTS.includes(ext)) {
    return "office";
  }

  if (
    normalizedMime.startsWith("audio/") ||
    normalizedMime.startsWith("video/") ||
    AUDIO_EXTS.includes(ext)
  ) {
    return "audio";
  }

  if (IMAGE_MIMES.includes(normalizedMime) || IMAGE_EXTS.includes(ext)) {
    return "image";
  }

  if (normalizedMime.startsWith("text/") || TEXT_MIMES.includes(normalizedMime) || TEXT_EXTS.includes(ext)) {
    return "text";
  }

  return null;
}

export function isSupportedDocumentFile(mime: string | null | undefined, filename: string): boolean {
  return getDocumentFileKind(mime, filename) !== null;
}

// 扩展名 → 规范 MIME 映射：覆盖 SUPPORTED_DOCUMENT_EXTENSIONS 的全部扩展名，
// 用于在浏览器/操作系统上报的 MIME 不可信时，按扩展名归一出一个确定的 MIME。
const EXTENSION_TO_CANONICAL_MIME: Record<string, string> = {
  ".pdf": "application/pdf",

  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".docm": "application/vnd.ms-word.document.macroenabled.12",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".xlsm": "application/vnd.ms-excel.sheet.macroenabled.12",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptm": "application/vnd.ms-powerpoint.presentation.macroenabled.12",

  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".txt": "text/plain",
  ".text": "text/plain",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".json": "application/json",
  ".jsonl": "application/x-ndjson",
  ".log": "text/plain",
  ".xml": "application/xml",
  ".html": "text/html",
  ".htm": "text/html",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",

  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".webm": "video/webm",
  ".amr": "audio/amr",
  ".wma": "audio/x-ms-wma",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",

  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jpe": "image/jpeg",
  ".jfif": "image/jpeg",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

/**
 * 上传落库前按扩展名归一化 MIME。
 *
 * 背景：浏览器上报的 File.type 不可靠（例如 Windows 装有 Excel 时，.csv 文件
 * 常被上报为 application/vnd.ms-excel），而数据库里存的 mime 是下游解析/渲染
 * 分发的权威依据，必须在落库前做一次归一化，避免用错误的 MIME 分流到错误的解析器。
 *
 * 判定规则：
 * 1. 扩展名无法识别（不在 SUPPORTED_DOCUMENT_EXTENSIONS 中）：无法按扩展名归一，
 *    原样尊重客户端上报的 mime（兜底 application/octet-stream）；
 * 2. mime 推断出的文件类别与扩展名推断出的类别一致：说明 mime 可信，且往往比
 *    映射表更精确（例如 image/pjpeg），保留原始 mime；
 * 3. 两者不一致（类别冲突，或 mime 为空/无法识别）：以扩展名为准，返回映射表中
 *    该扩展名对应的规范 MIME；映射表缺失时兜底原始 mime 或 application/octet-stream。
 */
export function normalizeDocumentMime(mime: string | null | undefined, filename: string): string {
  const fallback = mime || "application/octet-stream";

  const extKind = getDocumentFileKind(undefined, filename);
  if (!extKind) {
    return fallback;
  }

  const mimeKind = getDocumentFileKind(mime, "");
  if (mimeKind === extKind) {
    return fallback;
  }

  const ext = getFileExtension(filename);
  return EXTENSION_TO_CANONICAL_MIME[ext] || fallback;
}
