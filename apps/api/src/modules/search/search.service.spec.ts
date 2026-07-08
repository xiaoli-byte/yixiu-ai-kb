import { readFileSync } from "node:fs";
import "reflect-metadata";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
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
import { SearchController } from "./search.controller";

function createService() {
  const db = {
    tenantId: "tenant-1",
    userId: "user-1",
    query: vi.fn(),
  };
  const embeddings = {
    embedOne: vi.fn(),
  };
  const access = {
    visibleDocumentWhereSql: vi.fn().mockReturnValue({
      sql: "VISIBILITY_SQL",
      values: ["tenant-1", "user-1", "viewer"],
    }),
    getAccessFlags: vi.fn().mockResolvedValue({}),
  };
  const service = new SearchService(db as any, embeddings as any, access as any);
  return {
    service,
    db,
    embeddings,
    access,
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

  it("calculates weighted hot score", () => {
    const { service } = createService();

    expect(
      (service as any).hotScore({
        searchCount: 2,
        clickCount: 3,
        viewCount: 5,
        downloadCount: 7,
        pinnedWeight: 11,
      }),
    ).toBe(62);
  });
});

describe("SearchService permission-aware search", () => {
  it("keeps enough candidates for the second SearchList page", async () => {
    const { service, db, embeddings, access } = createService();
    embeddings.embedOne.mockRejectedValueOnce(new Error("vector unavailable"));

    const rows = Array.from({ length: 100 }, (_, index) => {
      const position = index + 1;
      return {
        chunkId: `chunk-${position}`,
        documentId: `doc-${position}`,
        contentId: `content-${position}`,
        documentTitle: `Doc ${position}`,
        mime: "text/plain",
        permissionScope: "COMPANY",
        categoryPath: "Policies",
        idx: 0,
        text: `risk ${position}`,
        highlight: `risk ${position}`,
        rank: 100 - index,
        page: null,
        updatedAt: new Date("2026-07-07T10:00:00.000Z"),
        createdAt: new Date("2026-07-06T10:00:00.000Z"),
      };
    });
    access.getAccessFlags.mockResolvedValueOnce(
      Object.fromEntries(
        rows.map((row) => [
          row.documentId,
          {
            canView: true,
            canDownload: false,
            canEdit: false,
            canDelete: false,
            canManagePermission: false,
          },
        ]),
      ),
    );
    db.query.mockResolvedValueOnce(rows).mockResolvedValue([]);

    const result = await service.searchList(
      { keyword: "risk", page: "2", pageSize: "50" },
      { sub: "user-1", tenantId: "tenant-1", role: "viewer" },
    );

    expect(result.hits).toHaveLength(50);
    expect(result.hits[0].chunkId).toBe("chunk-51");
    expect(result.hits[49].chunkId).toBe("chunk-100");
    expect(db.query.mock.calls[0][1]).toContain(100);
  });

  it("maps SearchList categoryId to document folder filtering in search SQL", async () => {
    const { service, db, embeddings, access } = createService();
    embeddings.embedOne.mockRejectedValueOnce(new Error("vector unavailable"));
    access.getAccessFlags.mockResolvedValueOnce({
      "doc-1": {
        canView: true,
        canDownload: false,
        canEdit: false,
        canDelete: false,
        canManagePermission: false,
      },
    });
    db.query.mockResolvedValueOnce([
      {
        chunkId: "chunk-1",
        documentId: "doc-1",
        contentId: "content-1",
        documentTitle: "Folder Doc",
        mime: "text/plain",
        permissionScope: "COMPANY",
        categoryPath: "Policies",
        idx: 0,
        text: "risk policy",
        highlight: "risk policy",
        rank: 0.8,
        page: null,
        updatedAt: new Date("2026-07-07T10:00:00.000Z"),
        createdAt: new Date("2026-07-06T10:00:00.000Z"),
      },
    ]).mockResolvedValue([]);

    await service.searchList(
      { keyword: "risk", categoryId: "folder-1", page: "1", pageSize: "20" },
      { sub: "user-1", tenantId: "tenant-1", role: "viewer" },
    );

    const sql = db.query.mock.calls[0][0] as string;
    const values = db.query.mock.calls[0][1] as unknown[];
    expect(sql).toContain("d.folder_id =");
    expect(values).toContain("folder-1");
  });

  it("selects categoryPath from joined folders instead of a hard-coded null", () => {
    const serviceSource = readFileSync("apps/api/src/modules/search/search.service.ts", "utf8");

    expect(serviceSource).toContain("LEFT JOIN folders f ON f.id = d.folder_id AND f.tenant_id = d.tenant_id");
    expect(serviceSource).toContain('f.name AS "categoryPath"');
    expect(serviceSource).not.toContain('NULL::text AS "categoryPath"');
  });

  it("passes user context into SQL visibility filtering and excludes unsearchable documents", async () => {
    const { service, db, access } = createService();
    access.visibleDocumentWhereSql.mockReturnValueOnce({
      sql: "VISIBILITY_SQL",
      values: ["tenant-1", "user-2", "viewer", "dept-1"],
    });
    access.getAccessFlags.mockResolvedValueOnce({
      "doc-1": {
        canView: true,
        canDownload: true,
        canEdit: false,
        canDelete: false,
        canManagePermission: false,
      },
    });
    db.query.mockResolvedValueOnce([
      {
        chunkId: "chunk-1",
        documentId: "doc-1",
        contentId: "content-1",
        documentTitle: "Risk Doc",
        mime: "text/plain",
        permissionScope: "COMPANY",
        idx: 0,
        text: "risk text",
        highlight: "risk text",
        rank: 0.9,
        hotScore: 4,
        viewCount: 2,
        downloadCount: 1,
        page: null,
        updatedAt: new Date("2026-07-07T10:00:00.000Z"),
        createdAt: new Date("2026-07-06T10:00:00.000Z"),
      },
    ]);

    const result = await service.search({
      q: "risk",
      mode: "keyword",
      topK: 10,
      user: {
        sub: "user-2",
        tenantId: "tenant-1",
        role: "viewer",
        departmentId: "dept-1",
      },
    } as any);

    expect(access.visibleDocumentWhereSql).toHaveBeenCalledWith(
      "d",
      {
        userId: "user-2",
        tenantId: "tenant-1",
        role: "viewer",
        departmentId: "dept-1",
      },
      expect.any(Number),
    );
    const sql = db.query.mock.calls[0][0] as string;
    expect(sql).toContain("VISIBILITY_SQL");
    expect(sql).toContain("d.searchable = TRUE");
    expect(sql).toContain("d.archived = FALSE");
    expect(result.hits[0]).toMatchObject({
      documentId: "doc-1",
      permissionScope: "COMPANY",
      canDownload: true,
    });
  });

  it("returns permission-filtered documents when filters are present without a keyword", async () => {
    const { service, db, embeddings, access } = createService();
    access.visibleDocumentWhereSql.mockReturnValueOnce({
      sql: "VISIBILITY_SQL",
      values: ["tenant-1", "user-2", "viewer"],
    });
    access.getAccessFlags.mockResolvedValueOnce({
      "doc-1": {
        canView: true,
        canDownload: false,
        canEdit: false,
        canDelete: false,
        canManagePermission: false,
      },
    });
    db.query.mockResolvedValueOnce([
      {
        chunkId: "chunk-1",
        documentId: "doc-1",
        contentId: "content-1",
        documentTitle: "制度规范",
        mime: "application/pdf",
        permissionScope: "COMPANY",
        categoryPath: "制度规范",
        idx: 0,
        text: "制度规范正文摘要",
        highlight: "制度规范正文摘要",
        score: 0,
        hotScore: 2,
        viewCount: 1,
        downloadCount: 0,
        page: null,
        updatedAt: new Date("2026-07-07T10:00:00.000Z"),
        createdAt: new Date("2026-07-06T10:00:00.000Z"),
        totalCount: 1,
      },
    ]);

    const result = await service.searchList(
      { fileType: "pdf", permissionScope: "COMPANY", page: "1", pageSize: "20" },
      { sub: "user-2", tenantId: "tenant-1", role: "viewer" },
    );

    expect(result).toMatchObject({
      query: "",
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(result.hits[0]).toMatchObject({
      documentId: "doc-1",
      documentTitle: "制度规范",
      canDownload: false,
      sources: [],
    });
    expect(embeddings.embedOne).not.toHaveBeenCalled();
    const sql = db.query.mock.calls[0][0] as string;
    const values = db.query.mock.calls[0][1] as unknown[];
    expect(sql).toContain("VISIBILITY_SQL");
    expect(sql).toContain("d.searchable = TRUE");
    expect(sql).toContain("d.mime ILIKE");
    expect(sql).not.toContain("plainto_tsquery");
    expect(values).toContain("%pdf%");
    expect(values).toContain("COMPANY");
    expect(db.query.mock.calls.some((call) => String(call[0]).includes("search_histories"))).toBe(false);
  });
});

describe("SearchController PRD routes", () => {
  it("exposes POST /search/history/clear for clearing user search history", async () => {
    const clearHistory = vi.fn().mockResolvedValue({ deleted: 2 });
    const controller = new SearchController({ clearHistory } as any);
    const method = (controller as any).clearHistoryWithPost;

    expect(method).toBeTypeOf("function");
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe("history/clear");
    expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(1);
    await expect(method.call(controller, "user-1")).resolves.toEqual({ deleted: 2 });
    expect(clearHistory).toHaveBeenCalledWith({ userId: "user-1" });
  });

  it("exposes POST /search/events for recording result interaction metrics", async () => {
    const recordSearchEvent = vi.fn().mockResolvedValue(undefined);
    const controller = new SearchController({ recordSearchEvent } as any);
    const method = (controller as any).recordEvent;

    expect(method).toBeTypeOf("function");
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe("events");
    expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(1);
    await expect(
      method.call(
        controller,
        { q: "知识库", eventType: "CLICK", resultCount: "3", documentId: "doc-1" },
        { sub: "user-1", tenantId: "tenant-1" },
      ),
    ).resolves.toEqual({ recorded: true });
    expect(recordSearchEvent).toHaveBeenCalledWith({
      keyword: "知识库",
      eventType: "CLICK",
      resultCount: 3,
      categoryId: null,
      documentId: "doc-1",
      contentId: null,
      chunkId: null,
      tenantId: "tenant-1",
      userId: "user-1",
    });
  });
});

describe("Document/search database PRD shape", () => {
  it("keeps search event targets and hot keyword nullable-category uniqueness explicit", () => {
    const schema = readFileSync("apps/api/src/database/prisma/schema.prisma", "utf8");
    const migration = readFileSync(
      "apps/api/src/database/prisma/migrations/0007_document_search_management/migration.sql",
      "utf8",
    );
    const service = readFileSync("apps/api/src/modules/search/search.service.ts", "utf8");

    expect(service).toContain('import type { SearchSortBy } from "@ai-knowledge/schemas";');
    expect(service).not.toContain("export type SearchSortBy =");
    expect(schema).toMatch(/permissionScope\s+String\s+@default\("PRIVATE"\)\s+@map\("permission_scope"\)\s+@db\.VarChar\(30\)/);
    expect(schema).toContain('@@index([documentId], map: "document_permissions_document_idx")');
    expect(schema).toContain('@@index([folderId], map: "folder_permissions_folder_idx")');
    expect(schema).toContain('documentId  String?  @map("document_id")');
    expect(schema).toContain('contentId   String?  @map("content_id")');
    expect(schema).toContain('chunkId     String?  @map("chunk_id")');
    expect(schema).not.toContain("@@unique([tenantId, keyword, categoryId]");

    expect(migration).toContain("document_permissions_document_idx");
    expect(migration).toContain("ON document_permissions (document_id)");
    expect(migration).toContain("folder_permissions_folder_idx");
    expect(migration).toContain("ON folder_permissions (folder_id)");
    expect(migration).toContain("document_id TEXT");
    expect(migration).toContain("content_id TEXT");
    expect(migration).toContain("chunk_id TEXT");
    expect(migration).toContain("search_events_tenant_document_event_created_idx");
    expect(migration).toContain("hot_search_keywords_tenant_keyword_null_category_unique");
    expect(migration).toContain("WHERE category_id IS NULL");
    expect(migration).toContain("hot_search_keywords_tenant_keyword_category_not_null_unique");
    expect(migration).toContain("WHERE category_id IS NOT NULL");
  });

  it("uses PRD search event names in metric aggregation and rate-limits GET search", () => {
    const service = readFileSync("apps/api/src/modules/search/search.service.ts", "utf8");
    const controller = readFileSync("apps/api/src/modules/search/search.controller.ts", "utf8");

    expect(service).toContain("se.event_type IN ('RESULT_CLICK', 'CLICK')");
    expect(service).toContain("se.event_type IN ('DOCUMENT_VIEW', 'VIEW')");
    expect(service).toContain("se.event_type IN ('DOCUMENT_DOWNLOAD', 'DOWNLOAD')");
    expect(controller).toMatch(/@Get\(\)\s*\r?\n\s*@RateLimit\(\{ \.\.\.RateLimitPolicies\.search/);
  });
});

describe("SearchService history helpers", () => {
  it("de-duplicates normalized query for a user before inserting the latest history item", async () => {
    const { service, db } = createService();

    await service.recordHistory({
      q: "  Risk   POLICY  ",
      mode: "hybrid",
      sortBy: "relevance",
      topK: 10,
      resultCount: 2,
      userId: "user-1",
    });

    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("DELETE FROM search_histories"),
      ["tenant-1", "user-1", "risk policy"],
    );
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO search_histories"),
      expect.arrayContaining(["tenant-1", "user-1", "risk policy", "hybrid", "relevance", 10, 2]),
    );
  });

  it("records search events with normalized keyword and optional targets", async () => {
    const { service, db } = createService();

    await (service as any).recordSearchEvent({
      keyword: "  Risk   POLICY  ",
      eventType: "SEARCH",
      resultCount: 3,
      userId: "user-2",
      categoryId: "cat-1",
      documentId: "doc-1",
      contentId: "content-1",
      chunkId: "chunk-1",
    });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO search_events"),
      expect.arrayContaining([
        "tenant-1",
        "user-2",
        "risk policy",
        "cat-1",
        "doc-1",
        "content-1",
        "chunk-1",
        3,
        "SEARCH",
      ]),
    );
  });

  it("normalizes legacy search event aliases to PRD event names", async () => {
    const { service, db } = createService();

    await (service as any).recordSearchEvent({
      keyword: "Risk",
      eventType: "CLICK",
      resultCount: 0,
    });
    await (service as any).recordSearchEvent({
      keyword: "Risk",
      eventType: "VIEW",
      resultCount: 0,
    });
    await (service as any).recordSearchEvent({
      keyword: "Risk",
      eventType: "DOWNLOAD",
      resultCount: 0,
    });

    expect(db.query.mock.calls.map((call) => (call[1] as unknown[])[9])).toEqual([
      "RESULT_CLICK",
      "DOCUMENT_VIEW",
      "DOCUMENT_DOWNLOAD",
    ]);
  });

  it("filters zero-result hot terms without click, view, or download activity", async () => {
    const { service, db } = createService();
    db.query.mockResolvedValueOnce([
      {
        keyword: "no results",
        categoryId: null,
        searchCount: 3,
        clickCount: 0,
        viewCount: 0,
        downloadCount: 0,
        resultCount: 0,
        pinned: false,
        pinnedWeight: 0,
      },
      {
        keyword: "clicked",
        categoryId: null,
        searchCount: 2,
        clickCount: 1,
        viewCount: 0,
        downloadCount: 0,
        resultCount: 0,
        pinned: false,
        pinnedWeight: 0,
      },
      {
        keyword: "resultful",
        categoryId: null,
        searchCount: 1,
        clickCount: 0,
        viewCount: 0,
        downloadCount: 0,
        resultCount: 5,
        pinned: false,
        pinnedWeight: 0,
      },
      {
        keyword: "   ",
        categoryId: null,
        searchCount: 5,
        clickCount: 5,
        viewCount: 5,
        downloadCount: 5,
        resultCount: 5,
        pinned: false,
        pinnedWeight: 0,
      },
    ]);

    await expect((service as any).listHotSearch({ range: "week", limit: "10" })).resolves.toEqual([
      {
        keyword: "clicked",
        hotScore: 4,
        searchCount: 2,
        clickCount: 1,
        viewCount: 0,
        downloadCount: 0,
        trend: "flat",
        categoryId: null,
        pinned: false,
      },
      {
        keyword: "resultful",
        hotScore: 1,
        searchCount: 1,
        clickCount: 0,
        viewCount: 0,
        downloadCount: 0,
        trend: "flat",
        categoryId: null,
        pinned: false,
      },
    ]);
    const sql = db.query.mock.calls[0][0] as string;
    expect(sql).toContain("search_events");
    expect(sql).toContain("hot_search_keywords");
    expect(sql).toContain("created_at >=");
    expect(sql).toMatch(/filtered\s+AS\s*\(/i);
    const filteredWhereIndex = sql.indexOf("WHERE keyword <> ''");
    expect(filteredWhereIndex).toBeGreaterThan(sql.indexOf("filtered AS"));
    expect(filteredWhereIndex).toBeLessThan(sql.lastIndexOf("LIMIT"));
    expect(sql).toMatch(/pinned\s*=\s*TRUE/i);
    expect(sql).toMatch(/"resultCount"\s*>\s*0/i);
    expect(sql).toMatch(/"clickCount"\s*>\s*0/i);
    expect(sql).toMatch(/"viewCount"\s*>\s*0/i);
    expect(sql).toMatch(/"downloadCount"\s*>\s*0/i);
    expect((db.query.mock.calls[0][1] as unknown[]).at(-1)).toBe(10);
  });

  it("filters hot search rows before final limit so low-quality terms do not under-fill results", async () => {
    const { service, db } = createService();
    db.query.mockResolvedValueOnce([
      {
        keyword: "valid",
        categoryId: null,
        searchCount: 1,
        clickCount: 1,
        viewCount: 0,
        downloadCount: 0,
        resultCount: 0,
        pinned: false,
        pinnedWeight: 0,
      },
    ]);

    await expect((service as any).listHotSearch({ range: "week", limit: "1" })).resolves.toEqual([
      {
        keyword: "valid",
        hotScore: 3,
        searchCount: 1,
        clickCount: 1,
        viewCount: 0,
        downloadCount: 0,
        trend: "flat",
        categoryId: null,
        pinned: false,
      },
    ]);
    const sql = db.query.mock.calls[0][0] as string;
    const filteredIndex = sql.indexOf("filtered AS");
    const limitIndex = sql.lastIndexOf("LIMIT");
    expect(filteredIndex).toBeGreaterThan(-1);
    expect(filteredIndex).toBeLessThan(limitIndex);
    expect((db.query.mock.calls[0][1] as unknown[]).at(-1)).toBe(1);
  });

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
