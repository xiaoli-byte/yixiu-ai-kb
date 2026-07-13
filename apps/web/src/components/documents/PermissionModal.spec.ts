import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PermissionModal } from "./PermissionModal";

describe("PermissionModal", () => {
  it("renders PRD permission controls", () => {
    const html = renderToStaticMarkup(
      createElement(PermissionModal, {
        open: true,
        target: { type: "batch", count: 2, documentIds: ["doc-1", "doc-2"] },
        onClose: vi.fn(),
        onSave: vi.fn(),
      }),
    );

    [
      "权限范围",
      "可见对象",
      "操作权限",
      "是否允许搜索",
      "是否允许AI问答引用",
      "追加权限",
      "覆盖权限",
      // “将此权限应用到子文件夹”入口已随 d15b713 注释下线，恢复时同步加回断言
      "保存",
      "取消",
    ].forEach((text) => {
      expect(html).toContain(text);
    });
  });
});
