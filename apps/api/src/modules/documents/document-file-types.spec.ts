import { describe, expect, it } from "vitest";
import { normalizeDocumentMime } from "./document-file-types";

describe("normalizeDocumentMime", () => {
  it("Windows 安装 Excel 时 .csv 常被上报为 application/vnd.ms-excel，应按扩展名归一为 text/csv", () => {
    expect(normalizeDocumentMime("application/vnd.ms-excel", "data.csv")).toBe("text/csv");
  });

  it("mime 与扩展名类别一致时保留原始 mime（原始值通常更精确）", () => {
    expect(normalizeDocumentMime("application/vnd.ms-excel", "report.xls")).toBe(
      "application/vnd.ms-excel",
    );
  });

  it("mime 与扩展名类别一致（pdf）时保留原始 mime，支持中文文件名", () => {
    expect(normalizeDocumentMime("application/pdf", "手册.pdf")).toBe("application/pdf");
  });

  it("mime 缺失时按扩展名归一", () => {
    expect(normalizeDocumentMime("", "photo.png")).toBe("image/png");
  });

  it("mime 与扩展名类别冲突时以扩展名为准", () => {
    expect(normalizeDocumentMime("image/png", "notes.txt")).toBe("text/plain");
  });

  it("扩展名不可识别时尊重原始 mime", () => {
    expect(normalizeDocumentMime("application/x-custom", "unknown.bin")).toBe(
      "application/x-custom",
    );
  });
});
