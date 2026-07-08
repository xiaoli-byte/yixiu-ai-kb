import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const searchDir = join(process.cwd(), "apps/web/src/app/(dashboard)/search");
const pageSource = readFileSync(join(searchDir, "page.tsx"), "utf8");
const clientPath = join(searchDir, "SearchPageClient.tsx");
const clientSource = existsSync(clientPath) ? readFileSync(clientPath, "utf8") : "";
const componentsDir = join(process.cwd(), "apps/web/src/components/search");
const toolbarSource = readFileSync(join(componentsDir, "SearchResultsToolbar.tsx"), "utf8");
const listSource = readFileSync(join(componentsDir, "SearchResultList.tsx"), "utf8");
const gridSource = readFileSync(join(componentsDir, "SearchResultGrid.tsx"), "utf8");
const filtersSource = readFileSync(join(componentsDir, "SearchFilters.tsx"), "utf8");
const source = `${pageSource}\n${clientSource}`;

describe("Search page source composition", () => {
  it("uses the dedicated search page components and required Chinese labels", () => {
    [
      "SearchSectionNav",
      "SearchLanding",
      "SearchFilters",
      "SearchResultsToolbar",
      "SearchResultList",
      "SearchResultGrid",
      "HotSearchPanel",
      "SearchHistoryPanel",
      "热门搜索",
      "搜索历史",
      "搜索筛选",
      "推荐分类",
      "高级搜索",
      "清空筛选",
      "权限范围",
      "相关度排序",
      "搜索页面区块导航",
      "部分内容因权限限制未展示",
    ].forEach((text) => {
      expect(source).toContain(text);
    });
  });

  it("guards filter-only state, URL changes, request races, and permission notices", () => {
    expect(clientSource).toContain("isMeaningfulFilterValue");
    expect(clientSource).toContain("keyword.trim().length > 0 || hasActiveFilter || advancedOpen");
    expect(clientSource).toContain("const shouldFetchResults = keyword.trim().length > 0 || hasActiveFilter");
    expect(clientSource).toContain("if (!trimmedKeyword && !hasAnySearchFilter(nextFilters))");
    expect(clientSource).toContain("if (trimmedKeyword) query.keyword = trimmedKeyword");
    expect(clientSource).toContain("if (trimmedKeyword) query.q = trimmedKeyword");
    expect(clientSource).toContain("showResults && shouldFetchResults");
    expect(clientSource).toContain("请先输入关键词，筛选会与关键词组合生效");
    expect(clientSource).not.toContain('applyFilters({ updateTimeRange: "all" })');
    expect(clientSource).toContain("keyword: item.label");
    expect(clientSource).toContain("const paramsKey = searchParams.toString()");
    expect(clientSource).toContain("setResult(null)");
    expect(clientSource).toContain("setHits([])");
    expect(clientSource).toContain("requestSeq");
    expect(clientSource).toContain("requestId !== requestSeq.current");
    expect(clientSource).toContain("permissionNotice={hits.some((hit) => hit.canDownload === false)}");
    expect(clientSource).toMatch(/setSort\("relevance"\)/);
    expect(clientSource).toContain("onView={openSearchHit}");
    expect(clientSource).toContain("onDownload={downloadSearchHit}");
  });

  it("does not treat updateTimeRange all as an active filter in filter controls", () => {
    expect(filtersSource).toContain("isMeaningfulFilterValue");
    expect(filtersSource).toContain('value !== "all"');
    expect(filtersSource).not.toContain("value.fileType || value.updateTimeRange || value.categoryId");
  });

  it("renders raw fallback snippets as text and keeps sort options compatible", () => {
    expect(`${listSource}\n${gridSource}`).toContain("HighlightedSnippet");
    expect(`${listSource}\n${gridSource}`).not.toContain("hit.highlight || hit.text");
    expect(toolbarSource).toContain('{ value: "time", label: "时间排序" }');
    expect(toolbarSource).toContain('{ value: "name", label: "名称排序" }');
  });
});
