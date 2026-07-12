import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const documentsDir = join(process.cwd(), "apps/web/src/app/(dashboard)/documents");
const pageSource = readFileSync(join(documentsDir, "page.tsx"), "utf8");
const componentsDir = join(process.cwd(), "apps/web/src/components/documents");
const componentSources = [
  "DocumentScopeNav.tsx",
  "DocumentToolbar.tsx",
  "BatchActionBar.tsx",
  "DocumentTable.tsx",
  "PermissionModal.tsx",
]
  .map((file) => {
    const path = join(componentsDir, file);
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  })
  .join("\n");
const source = `${pageSource}\n${componentSources}`;

describe("Documents page PRD structure", () => {
  it("composes scope nav, toolbar, batch actions, table, and permission modal", () => {
    [
      "DocumentScopeNav",
      "DocumentToolbar",
      "BatchActionBar",
      "DocumentTable",
      "PermissionModal",
    ].forEach((text) => {
      expect(source).toContain(text);
    });
  });

  it("contains the PRD document-management labels and table columns", () => {
    [
      "我的文档",
      "公共文档",
      "部门文档",
      "回收站",
      "批量上传",
      "新建文件夹",
      "文件类型",
      "解析状态",
      "权限范围",
      "批量设置权限",
      "文档名称",
      "上传时间",
      "上传人",
      "操作",
      "上传时间",
      "所属部门",
      "跳转至",
    ].forEach((text) => {
      expect(source).toContain(text);
    });
  });

  it("wires advanced filters and page jumping into the document query", () => {
    [
      "uploaderId",
      "departmentId",
      "uploadedFrom",
      "uploadedTo",
      "goToPageInput",
    ].forEach((text) => {
      expect(source).toContain(text);
    });

    expect(pageSource).toContain("uploaderId: uploaderId.trim() || undefined");
    expect(pageSource).toContain("departmentId: departmentId.trim() || undefined");
    expect(pageSource).toContain("uploadedFrom: uploadedFrom || undefined");
    expect(pageSource).toContain("uploadedTo: uploadedTo || undefined");
    expect(pageSource).toContain("archived: resolveArchivedQuery(scope)");
  });

  it("uses the backend batch-upload endpoint and shows per-file upload results", () => {
    expect(pageSource).toContain('form.append("files", file)');
    expect(pageSource).toContain("documentsApi.uploadBatch(form)");
    expect(pageSource).toContain("uploadResults");
    expect(pageSource).toContain("开始上传");
    expect(pageSource).not.toContain('form.append("file", file)');
  });

  it("appends later file selections instead of replacing the selected list", () => {
    expect(pageSource).toContain("mergeUploadFiles(current, incomingFiles)");
    expect(pageSource).toContain("setSelectedFiles((current) =>");
    expect(pageSource).not.toContain("setSelectedFiles(files ? Array.from(files) : [])");
  });
});
