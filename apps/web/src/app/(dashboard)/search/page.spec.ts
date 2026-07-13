import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const clientSource = readFileSync(
  join(process.cwd(), "apps/web/src/app/(dashboard)/search/SearchPageClient.tsx"),
  "utf8",
);

describe("Search page state orchestration", () => {
  it("has only URL-driven landing and results states without the fixed section navigation", () => {
    expect(clientSource).toContain('data-search-state="landing"');
    expect(clientSource).toContain('data-search-state="results"');
    expect(clientSource).toContain("const isResultsState = keyword.trim().length > 0 || hasActiveFilter");
    expect(clientSource).not.toContain("SearchSectionNav");
    expect(clientSource).toContain("SearchLanding");
    expect(clientSource).toContain("SearchPagination");
    expect(clientSource).toContain("SearchSelectedFilters");
  });

  it("round-trips the supported URL state and resets page for a new query scope", () => {
    ["keyword", "mode", "fileType", "updateTimeRange", "categoryId", "sort", "page", "viewMode"].forEach((key) => {
      expect(clientSource).toContain(`params.set("${key}"`);
      expect(clientSource).toContain(`params.get("${key}")`);
    });
    expect(clientSource).toContain("replaceUrl({ keyword: nextKeyword, page: 1 })");
    expect(clientSource).toContain("replaceUrl({ filters: nextFilters, page: 1 })");
    expect(clientSource).toContain("replaceUrl({ mode: nextMode, page: 1 })");
    expect(clientSource).toContain("replaceUrl({ page: nextPage })");
    expect(clientSource).toContain("<SearchPagination");
  });

  it("uses real landing sources, independently degrades them, and preserves request race protection", () => {
    expect(clientSource).toContain("foldersApi.tree()");
    expect(clientSource).toContain("documentsApi.list({ page: 1, pageSize: 12 })");
    expect(clientSource).toContain("Promise.allSettled");
    expect(clientSource).toContain("flattenFolders");
    expect(clientSource).not.toContain('id: "policy"');
    expect(clientSource).toContain("requestSeq");
    expect(clientSource).toContain("requestId !== requestSeq.current");
    expect(clientSource).toContain("Keep the prior page visible during a failed refresh or page change.");
    expect(clientSource).toContain("lastSuccessfulPage");
  });

  it("records result interactions but never sends a duplicate SEARCH event from the client", () => {
    expect(clientSource).toContain("recordSearchEvent");
    expect(clientSource).toContain('recordHitEvent(hit, "DOCUMENT_VIEW")');
    expect(clientSource).not.toContain('recordHitEvent(hit, "RESULT_CLICK")');
    expect(clientSource).toContain("interactionToken: hit.interactionToken");
    expect(clientSource).not.toContain('eventType: "SEARCH"');
    expect(clientSource).toContain("getDocumentFileBlob");
    expect(clientSource).toContain("openDocumentBlob(hit.documentId, hit.documentTitle, true)");
    expect(clientSource).toContain('recordHitEvent(hit, "DOCUMENT_DOWNLOAD")');
    expect(clientSource).toContain("openOriginalSearchHit");
    expect(clientSource).toContain("previewSearchHit");
    // The QA page has no document-context deep-link contract yet, so the optional action stays hidden.
    expect(clientSource).not.toContain("onAskAI=");
  });

  it("keeps view preferences client-side and only accepts UI-supported sorts and time ranges", () => {
    expect(clientSource).not.toMatch(/pageSize: DEFAULT_PAGE_SIZE,\s+viewMode:/);
    expect(clientSource).toContain('const SEARCH_SORTS: SearchSortBy[] = ["relevance", "time", "name"]');
    expect(clientSource).not.toContain('value === "custom"');
  });
});
