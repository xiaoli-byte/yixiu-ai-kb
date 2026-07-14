import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GraphToolbar } from "./GraphToolbar";

const toolbarProps = {
  filters: {
    keyword: "",
    nodeType: "all" as const,
    depth: 2,
    limit: 80,
  },
  filterOptions: {
    entityTypes: [],
    relationTypes: [],
    documents: [],
  },
  loading: false,
  onChange: vi.fn(),
  onSearch: vi.fn(),
  onReset: vi.fn(),
  onExport: vi.fn(),
};

describe("GraphToolbar", () => {
  it("groups graph exports behind one dropdown trigger", () => {
    const html = renderToStaticMarkup(React.createElement(GraphToolbar, toolbarProps));

    expect(html).toContain('aria-label="导出图谱"');
    expect(html).toContain('data-export-trigger="graph"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('data-export-format="png"');
    expect(html).toContain('data-export-format="svg"');
    expect(html).toContain('data-export-format="json"');
    expect(html.match(/data-export-format=/g)).toHaveLength(3);
  });

  it("keeps the graph search filters compact", () => {
    const html = renderToStaticMarkup(React.createElement(GraphToolbar, toolbarProps));

    // 创建时间范围改用自建月历 DateRangeField（无原生 type=date）
    expect(html).toContain('aria-label="创建时间范围"');
    expect(html).not.toContain('type="date"');
    // 三个过滤下拉统一为无障碍 Select（listbox），保留各自 aria-label
    expect(html).toContain('aria-label="节点类型"');
    expect(html).toContain('aria-label="文档"');
    expect(html).toContain('aria-label="关系类型"');
    expect(html).not.toContain('aria-label="更新开始"');
    expect(html).not.toContain('aria-label="更新结束"');
    expect(html).not.toContain('aria-label="节点上限"');
    expect(html).not.toContain('aria-label="关系深度"');
    expect(html).not.toContain('aria-label="业务分类"');
    expect(html).not.toContain('aria-label="实体类型"');
  });

  it("uses one created date range field and keeps export inline at the row end", () => {
    const html = renderToStaticMarkup(React.createElement(GraphToolbar, toolbarProps));

    expect(html).toContain('data-filter-row="graph"');
    expect(html).toContain('data-date-range="created"');
    expect(html).toContain('aria-label="创建时间范围"');
    expect(html).toContain('data-export-row="graph"');
    expect(html.indexOf('data-export-row="graph"')).toBeGreaterThan(
      html.indexOf('data-filter-row="graph"'),
    );
    expect(html.indexOf('data-export-trigger="graph"')).toBeGreaterThan(
      html.indexOf('data-export-row="graph"'),
    );
  });
});
