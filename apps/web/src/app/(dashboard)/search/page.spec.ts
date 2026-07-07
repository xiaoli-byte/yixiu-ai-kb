import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const searchDir = join(process.cwd(), "apps/web/src/app/(dashboard)/search");
const pageSource = readFileSync(join(searchDir, "page.tsx"), "utf8");
const clientPath = join(searchDir, "SearchPageClient.tsx");
const clientSource = existsSync(clientPath) ? readFileSync(clientPath, "utf8") : "";
const source = `${pageSource}\n${clientSource}`;

describe("Search page source composition", () => {
  it("uses the dedicated search page components and required Chinese labels", () => {
    [
      "SearchLanding",
      "SearchFilters",
      "SearchResultsToolbar",
      "SearchResultList",
      "SearchResultGrid",
      "HotSearchPanel",
      "SearchHistoryPanel",
      "热门搜索",
      "搜索历史",
      "推荐分类",
      "高级搜索",
      "清空筛选",
      "权限范围",
      "相关度排序",
      "部分内容因权限限制未展示",
    ].forEach((text) => {
      expect(source).toContain(text);
    });
  });
});
