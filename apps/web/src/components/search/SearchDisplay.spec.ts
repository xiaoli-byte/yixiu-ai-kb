import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SearchEmptyState } from "./SearchStatePanels";
import { SearchPagination } from "./SearchPagination";
import { SearchResultsToolbar } from "./SearchResultsToolbar";
import { sanitizeSearchHighlight } from "./SearchResultList";

describe("search display components", () => {
  it("exposes accessible result controls and permission copy", () => {
    const html = renderToStaticMarkup(createElement(SearchResultsToolbar, {
      total: 24, took: 120, sort: "relevance", viewMode: "list", permissionNotice: true,
      onSortChange: vi.fn(), onViewModeChange: vi.fn(),
    }));
    expect(html).toContain("排序方式");
    expect(html).toContain("列表视图");
    expect(html).toContain("部分文档可预览，但不可下载");
  });

  it("renders a useful empty state", () => {
    const html = renderToStaticMarkup(createElement(SearchEmptyState, { filtered: true, onClear: vi.fn() }));
    expect(html).toContain("没有找到匹配结果");
    expect(html).toContain("清除筛选");
    expect(html).toContain("搜索结果为空");
  });

  it("renders pagination summary with named navigation buttons", () => {
    const html = renderToStaticMarkup(createElement(SearchPagination, { page: 2, pageSize: 10, total: 24, onPageChange: vi.fn() }));
    expect(html).toContain("显示第 11–20 条，共 24 条");
    expect(html).toContain("上一页");
    expect(html).toContain("下一页");
  });

  it("preserves mark tags but escapes document-supplied HTML in highlights", () => {
    expect(sanitizeSearchHighlight('<mark>命中</mark><img src=x onerror="alert(1)">')).toBe(
      '<mark>命中</mark>&lt;img src=x onerror="alert(1)"&gt;',
    );
    expect(sanitizeSearchHighlight("已转义 &lt;标签&gt; &amp; 内容")).toBe(
      "已转义 &lt;标签&gt; &amp; 内容",
    );
  });
});
