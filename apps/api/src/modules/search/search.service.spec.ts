import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  DocumentBatchOperationRequest,
  DocumentPermissionScope,
  DocumentPermissionUpdateRequest,
  HotSearchQuery,
  SearchListQuery,
  SearchQuery,
} from "@ai-knowledge/schemas";
import { SearchService, type SearchHit } from "./search.service";

function createService() {
  const db = {
    tenantId: "tenant-1",
    userId: "user-1",
    query: vi.fn(),
  };
  const embeddings = {
    embedOne: vi.fn(),
  };
  return {
    service: new SearchService(db as any, embeddings as any),
    db,
    embeddings,
  };
}

function hit(overrides: Partial<SearchHit>): SearchHit {
  return {
    chunkId: "chunk",
    documentId: "doc",
    documentTitle: "Doc",
    mime: "text/plain",
    idx: 0,
    text: "text",
    highlight: "text",
    score: 0,
    sources: ["bm25"],
    page: null,
    ...overrides,
  };
}

describe("Search schema", () => {
  it("defaults sortBy to relevance and accepts time/name", () => {
    expect(SearchQuery.parse({ q: "risk" }).sortBy).toBe("relevance");
    expect(SearchQuery.parse({ q: "risk", sortBy: "time" }).sortBy).toBe("time");
    expect(SearchQuery.parse({ q: "risk", sortBy: "name" }).sortBy).toBe("name");
  });
});

describe("Document/search PRD schemas", () => {
  it("accepts document permission updates with AI and search switches", () => {
    const parsed = DocumentPermissionUpdateRequest.parse({
      permissionScope: "COMPANY",
      entries: [
        {
          subjectType: "ROLE",
          subjectId: "viewer",
          canView: true,
          canDownload: false,
          canEdit: false,
          canDelete: false,
          canManagePermission: false,
        },
      ],
      searchable: true,
      aiReferenceEnabled: false,
      applyToChildren: false,
      mode: "APPEND",
    });

    expect(parsed.permissionScope).toBe("COMPANY");
    expect(parsed.aiReferenceEnabled).toBe(false);
  });

  it("accepts search filters and hot search ranges", () => {
    expect(DocumentPermissionScope.parse("DEPARTMENTS")).toBe("DEPARTMENTS");
    expect(SearchListQuery.parse({ keyword: "制度", fileType: "PDF", sort: "updatedAt" }).sort).toBe("updatedAt");
    expect(HotSearchQuery.parse({ range: "week", limit: "20" }).limit).toBe(20);
  });

  it("accepts batch archive and move document operations", () => {
    expect(
      DocumentBatchOperationRequest.parse({
        action: "MOVE",
        documentIds: ["doc-1", "doc-2"],
        folderId: "folder-1",
      }).action,
    ).toBe("MOVE");
  });
});

describe("SearchService result helpers", () => {
  it("generates safe highlights for plain vector or fallback snippets", () => {
    const { service } = createService();

    const highlight = (service as any).buildSafeHighlight(
      "Alpha <img src=x onerror=alert(1)> risk & riskless",
      "risk <script>",
    );

    expect(highlight).toContain("<mark>risk</mark>");
    expect(highlight).toContain("&lt;img");
    expect(highlight).toContain("&amp;");
    expect(highlight).not.toContain("<img");
    expect(highlight).not.toContain("<script");
    expect(highlight.match(/<\/?([a-z][^>]*)>/gi)).toEqual(["<mark>", "</mark>"]);
  });

  it("escapes ts_headline output while preserving mark tags", () => {
    const { service } = createService();

    const highlight = (service as any).normalizeHighlight(
      "Intro <mark>risk</mark> <img src=x onerror=alert(1)>",
      "Intro risk",
      "risk",
    );

    expect(highlight).toBe("Intro <mark>risk</mark> &lt;img src=x onerror=alert(1)&gt;");
  });

  it("sorts relevance by score, time by newest timestamp, and name by title then chunk index", () => {
    const { service } = createService();
    const hits = [
      hit({ chunkId: "b-2", documentTitle: "Beta", idx: 2, score: 0.9, updatedAt: "2026-07-01T00:00:00.000Z" } as any),
      hit({ chunkId: "a-3", documentTitle: "Alpha", idx: 3, score: 0.3, updatedAt: "2026-07-03T00:00:00.000Z" } as any),
      hit({ chunkId: "a-1", documentTitle: "Alpha", idx: 1, score: 0.5, updatedAt: "2026-07-02T00:00:00.000Z" } as any),
    ];

    expect((service as any).sortHits(hits, "relevance").map((h: SearchHit) => h.chunkId)).toEqual(["b-2", "a-1", "a-3"]);
    expect((service as any).sortHits(hits, "time").map((h: SearchHit) => h.chunkId)).toEqual(["a-3", "a-1", "b-2"]);
    expect((service as any).sortHits(hits, "name").map((h: SearchHit) => h.chunkId)).toEqual(["a-1", "a-3", "b-2"]);
  });

  it("accepts expanded contract sort values with stable fallbacks", () => {
    const { service } = createService();
    const hits = [
      hit({ chunkId: "old-hot", documentTitle: "Beta", idx: 2, score: 0.9, updatedAt: "2026-07-01T00:00:00.000Z" } as any),
      hit({ chunkId: "new-low", documentTitle: "Alpha", idx: 1, score: 0.3, updatedAt: "2026-07-03T00:00:00.000Z" } as any),
      hit({ chunkId: "mid", documentTitle: "Gamma", idx: 3, score: 0.5, updatedAt: "2026-07-02T00:00:00.000Z" } as any),
    ];

    const updatedAtSort = SearchQuery.parse({ q: "risk", sortBy: "updatedAt" }).sortBy;
    expect((service as any).sortHits(hits, updatedAtSort).map((h: SearchHit) => h.chunkId)).toEqual(["new-low", "mid", "old-hot"]);

    for (const sortBy of ["hot", "views", "downloads"] as const) {
      const parsedSort = SearchQuery.parse({ q: "risk", sortBy }).sortBy;
      expect((service as any).sortHits(hits, parsedSort).map((h: SearchHit) => h.chunkId)).toEqual(["old-hot", "mid", "new-low"]);
    }
  });
});

describe("Document/search database PRD shape", () => {
  it("keeps search event targets and hot keyword nullable-category uniqueness explicit", () => {
    const schema = readFileSync("apps/api/src/database/prisma/schema.prisma", "utf8");
    const migration = readFileSync(
      "apps/api/src/database/prisma/migrations/0007_document_search_management/migration.sql",
      "utf8",
    );

    expect(schema).toContain('documentId  String?  @map("document_id")');
    expect(schema).toContain('contentId   String?  @map("content_id")');
    expect(schema).toContain('chunkId     String?  @map("chunk_id")');
    expect(schema).not.toContain("@@unique([tenantId, keyword, categoryId]");

    expect(migration).toContain("document_id TEXT");
    expect(migration).toContain("content_id TEXT");
    expect(migration).toContain("chunk_id TEXT");
    expect(migration).toContain("search_events_tenant_document_event_created_idx");
    expect(migration).toContain("hot_search_keywords_tenant_keyword_null_category_unique");
    expect(migration).toContain("WHERE category_id IS NULL");
    expect(migration).toContain("hot_search_keywords_tenant_keyword_category_not_null_unique");
    expect(migration).toContain("WHERE category_id IS NOT NULL");
  });
});

describe("SearchService history helpers", () => {
  it("records and reads search history scoped to tenant and user", async () => {
    const { service, db } = createService();
    const createdAt = new Date("2026-07-07T12:00:00.000Z");

    await service.recordHistory({
      q: "risk",
      mode: "semantic",
      sortBy: "time",
      topK: 20,
      resultCount: 3,
    });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO search_histories"),
      expect.arrayContaining(["tenant-1", "user-1", "risk", "semantic", "time", 20, 3]),
    );

    db.query.mockResolvedValueOnce([
      {
        id: "history-1",
        query: "risk",
        mode: "semantic",
        sortBy: "time",
        topK: 20,
        resultCount: 3,
        createdAt,
      },
    ]);

    await expect(service.listHistory({ limit: 500 })).resolves.toEqual([
      {
        id: "history-1",
        query: "risk",
        mode: "semantic",
        sortBy: "time",
        topK: 20,
        resultCount: 3,
        createdAt: "2026-07-07T12:00:00.000Z",
      },
    ]);
    expect(db.query).toHaveBeenLastCalledWith(expect.stringContaining("ORDER BY created_at DESC"), ["tenant-1", "user-1", 100]);
  });

  it("deletes one history item or all history within tenant and user scope", async () => {
    const { service, db } = createService();
    db.query.mockResolvedValueOnce([{ id: "history-1" }]).mockResolvedValueOnce([{ id: "history-1" }, { id: "history-2" }]);

    await expect(service.deleteHistory("history-1")).resolves.toEqual({ deleted: 1 });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("AND id = $3"), ["tenant-1", "user-1", "history-1"]);

    await expect(service.clearHistory()).resolves.toEqual({ deleted: 2 });
    expect(db.query).toHaveBeenLastCalledWith(expect.not.stringContaining("AND id = $3"), ["tenant-1", "user-1"]);
  });
});
