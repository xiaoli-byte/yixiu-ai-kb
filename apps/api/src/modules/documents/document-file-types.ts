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
