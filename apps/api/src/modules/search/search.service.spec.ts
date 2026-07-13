import { readFileSync } from "node:fs";
import "reflect-metadata";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { describe, expect, it, vi } from "vitest";
import {
  DocumentBatchOperationRequest,
  DocumentPermissionScope,
  DocumentPermissionUpdateRequest,
  HotSearchQuery,
  SearchListQuery,
  SearchQuery,
  SearchResponse,
} from "@ai-knowledge/schemas";
import { SearchService, type SearchHit } from "./search.service";
import { SearchController } from "./search.controller";
import { SearchRetrieveController } from "./search-retrieve.controller";
import { RateLimitGuard } from "../../common/rate-limit/rate-limit.guard";

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
  const config = { jwt: { accessSecret: "search-interaction-test-secret" } };
  const service = new SearchService(db as any, embeddings as any, access as any, config as any);
  return {
    service,
    db,
    embeddings,
    access,
  };
}

function interactionToken(
  service: SearchService,
  overrides: Partial<{
    tenantId: string;
    userId: string;
    keyword: string;
    documentId: string;
    exp: number;
  }> = {},
) {
  return (service as any).createInteractionToken({
    v: 1,
    tenantId: "tenant-1",
    userId: "user-2",
    keyword: "risk",
    documentId: "doc-1",
    exp: Math.floor(Date.now() / 1000) + 60,
    ...overrides,
  });
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

  it("expresses bounded totals with explicit truncation metadata", () => {
    expect(
      SearchResponse.parse({
        query: "risk",
        mode: "hybrid",
        sortBy: "relevance",
        total: 500,
        hits: [],
        took: 10,
        truncated: true,
        resultLimit: 500,
      }),
    ).toMatchObject({ truncated: true, resultLimit: 500 });
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
    expect(SearchListQuery.parse({ keyword: "制度", fileType: "PDF", sort: "updatedAt" })).toMatchObject({
      mode: "hybrid",
      sort: "updatedAt",
    });
    expect(SearchListQuery.parse({ keyword: "制度", mode: "semantic" }).mode).toBe("semantic");
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
  it("issues result-bound interaction tokens that verify only for the same actor, keyword, and document", () => {
    const { service } = createService();
    const actor = { tenantId: "tenant-1", userId: "user-2", role: "viewer" };
    const [signed] = (service as any).attachInteractionTokens(
      [hit({ documentId: "doc-1" })],
      actor,
      "  Risk  ",
    );

    expect(signed.interactionToken).toBeTruthy();
    expect((service as any).verifyInteractionToken(
      signed.interactionToken,
      actor,
      "risk",
      "doc-1",
    )).toBe(true);
    expect((service as any).verifyInteractionToken(
      signed.interactionToken,
      actor,
      "other",
      "doc-1",
    )).toBe(false);
  });

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
  it("uses the bounded candidate set for stable second-page total and hasMore", async () => {
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
    expect(result).toMatchObject({
      mode: "hybrid",
      page: 2,
      pageSize: 50,
      total: 100,
      hasMore: false,
    });
    expect(db.query.mock.calls[0][1]).toContain(500);
    expect(db.query.mock.calls.some((call) => String(call[0]).includes("INSERT INTO search_histories"))).toBe(false);
    expect(db.query.mock.calls.some((call) => String(call[0]).includes("INSERT INTO search_events"))).toBe(false);
  });

  it("passes SearchList mode to the search algorithm and records one explicit search", async () => {
    const { service } = createService();
    const search = vi.spyOn(service, "search").mockResolvedValue({
      hits: Array.from({ length: 25 }, (_, index) =>
        hit({ chunkId: `chunk-${index + 1}`, documentId: `doc-${index + 1}` }),
      ),
      took: 7,
      hasRelevantResults: true,
      truncated: false,
    });
    const recordHistory = vi.spyOn(service, "recordHistory").mockResolvedValue(undefined);
    const recordSearchEvent = vi.spyOn(service, "recordSearchEvent").mockResolvedValue(undefined);

    const result = await service.searchList(
      { keyword: "risk", mode: "semantic", page: "1", pageSize: "10" },
      { sub: "user-1", tenantId: "tenant-1", role: "viewer" },
    );

    expect(search).toHaveBeenCalledWith(expect.objectContaining({
      q: "risk",
      mode: "semantic",
      topK: 500,
      candidateLimit: 500,
    }));
    expect(result).toMatchObject({
      mode: "semantic",
      page: 1,
      pageSize: 10,
      total: 25,
      hasMore: true,
    });
    expect(result.hits).toHaveLength(10);
    expect(recordHistory).toHaveBeenCalledTimes(1);
    expect(recordSearchEvent).toHaveBeenCalledTimes(1);
    expect(recordHistory).toHaveBeenCalledWith(expect.objectContaining({ mode: "semantic", resultCount: 25 }));
    expect(recordSearchEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "SEARCH", resultCount: 25 }));
  });

  it("marks a saturated 500-result window as truncated instead of an exact global total", async () => {
    const { service } = createService();
    vi.spyOn(service, "search").mockResolvedValue({
      hits: Array.from({ length: 500 }, (_, index) =>
        hit({ chunkId: `chunk-${index + 1}`, documentId: `doc-${index + 1}` }),
      ),
      took: 12,
      hasRelevantResults: true,
      truncated: true,
    });
    vi.spyOn(service, "recordHistory").mockResolvedValue(undefined);
    vi.spyOn(service, "recordSearchEvent").mockResolvedValue(undefined);

    const result = await service.searchList(
      { keyword: "risk", page: "1", pageSize: "20" },
      { sub: "user-1", tenantId: "tenant-1", role: "viewer" },
    );

    expect(result).toMatchObject({
      total: 500,
      truncated: true,
      resultLimit: 500,
      hasMore: true,
    });
  });

  it("computes keyword total after permission filtering", async () => {
    const { service, db, access } = createService();
    db.query.mockResolvedValueOnce([
      ...[1, 2, 3].map((position) => ({
        chunkId: `chunk-${position}`,
        documentId: `doc-${position}`,
        contentId: `content-${position}`,
        documentTitle: `Doc ${position}`,
        mime: "text/plain",
        permissionScope: "COMPANY",
        idx: 0,
        text: `risk ${position}`,
        highlight: `risk ${position}`,
        rank: 4 - position,
        page: null,
      })),
    ]);
    access.getAccessFlags.mockResolvedValueOnce({
      "doc-1": { canView: true, canDownload: false },
      "doc-2": { canView: false, canDownload: false },
      "doc-3": { canView: true, canDownload: true },
    });

    const result = await service.searchList(
      { keyword: "risk", mode: "keyword", page: "1", pageSize: "1" },
      { sub: "user-1", tenantId: "tenant-1", role: "viewer" },
    );

    expect(result).toMatchObject({ total: 2, hasMore: true });
    expect(result.hits.map((item) => item.documentId)).toEqual(["doc-1"]);
    const sql = db.query.mock.calls[0][0] as string;
    expect(sql).toContain("VISIBILITY_SQL");
    expect(sql).toContain("d.searchable = TRUE");
    expect(sql).toContain("d.archived = FALSE");
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

  it("scopes retrieve by knowledgeBaseId when it maps to an existing tenant folder (CALL-10 #1)", async () => {
    const { service, db } = createService();
    // 第一次 query = folder 存在性校验；其余 = 检索
    db.query
      .mockResolvedValueOnce([{ id: "folder-1" }])
      .mockResolvedValue([]);

    await service.search({
      q: "risk",
      mode: "keyword",
      topK: 10,
      user: { sub: "user-2", tenantId: "tenant-1", role: "viewer" },
      filters: { knowledgeBaseId: "folder-1" },
    } as any);

    const folderCall = db.query.mock.calls.find((c: any[]) => String(c[0]).includes("FROM folders"));
    expect(folderCall).toBeTruthy();
    expect(folderCall![1]).toEqual(["folder-1", "tenant-1"]);

    const searchCall = db.query.mock.calls.find((c: any[]) => String(c[0]).includes("VISIBILITY_SQL"));
    expect(String(searchCall![0])).toContain("d.folder_id =");
    expect(searchCall![1]).toContain("folder-1");
  });

  it("returns empty without tenant-wide retrieval when knowledgeBaseId is invalid or cross-tenant", async () => {
    const { service, db } = createService();
    db.query.mockResolvedValueOnce([]);

    const result = await service.search({
      q: "risk",
      mode: "keyword",
      topK: 10,
      user: { sub: "user-2", tenantId: "tenant-1", role: "viewer" },
      filters: { knowledgeBaseId: "kb-unaligned" },
    } as any);

    expect(result).toMatchObject({ hits: [], hasRelevantResults: false, truncated: false });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(String(db.query.mock.calls[0][0])).toContain("FROM folders");
    expect(db.query.mock.calls.some((call) => String(call[0]).includes("VISIBILITY_SQL"))).toBe(false);
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
      mode: "hybrid",
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
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
    expect(db.query.mock.calls.some((call) => String(call[0]).includes("INSERT INTO search_histories"))).toBe(false);
    expect(db.query.mock.calls.some((call) => String(call[0]).includes("INSERT INTO search_events"))).toBe(false);
  });

  it("uses the same total and hasMore semantics for filter-only pagination", async () => {
    const { service, db, access } = createService();
    db.query.mockResolvedValueOnce([{
      chunkId: "chunk-21",
      documentId: "doc-21",
      contentId: "content-21",
      documentTitle: "制度 21",
      mime: "application/pdf",
      permissionScope: "COMPANY",
      idx: 0,
      text: "制度摘要",
      page: null,
      totalCount: 45,
    }]);
    access.getAccessFlags.mockResolvedValueOnce({
      "doc-21": { canView: true, canDownload: false },
    });

    const result = await service.searchList(
      { fileType: "pdf", page: "2", pageSize: "20" },
      { sub: "user-1", tenantId: "tenant-1", role: "viewer" },
    );

    expect(result).toMatchObject({ page: 2, pageSize: 20, total: 45, hasMore: true });
    expect((db.query.mock.calls[0][1] as unknown[]).slice(-2)).toEqual([20, 20]);
  });

  it("keeps the exact filter-only total when the requested page has no rows", async () => {
    const { service, db } = createService();
    db.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ totalCount: 45 }]);

    const result = await service.searchList(
      { fileType: "pdf", page: "4", pageSize: "20" },
      { sub: "user-1", tenantId: "tenant-1", role: "viewer" },
    );

    expect(result).toMatchObject({
      page: 4,
      pageSize: 20,
      total: 45,
      hits: [],
      hasMore: false,
      truncated: false,
    });
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(String(db.query.mock.calls[1][0])).toContain('COUNT(*)::int AS "totalCount"');
    expect(db.query.mock.calls[1][1]).not.toContain(20);
  });

  it("returns an empty paginated response without search history or events for an empty query", async () => {
    const { service, db, embeddings } = createService();

    await expect(service.searchList(
      { keyword: "   ", mode: "keyword", page: "2", pageSize: "10" },
      { sub: "user-1", tenantId: "tenant-1", role: "viewer" },
    )).resolves.toMatchObject({
      query: "",
      mode: "keyword",
      page: 2,
      pageSize: 10,
      total: 0,
      hasMore: false,
      hits: [],
    });
    expect(embeddings.embedOne).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe("SearchController PRD routes", () => {
  it("activates the rate-limit guard for decorated search routes", () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, SearchController) ?? [];
    expect(guards).toContain(RateLimitGuard);
  });

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
    const recordResultInteraction = vi.fn().mockResolvedValue(true);
    const controller = new SearchController({ recordResultInteraction } as any);
    const method = (controller as any).recordEvent;

    expect(method).toBeTypeOf("function");
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe("events");
    expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(1);
    await expect(
      method.call(
        controller,
        { q: "知识库", eventType: "VIEW", resultCount: "3", documentId: "doc-1", interactionToken: "signed-token" },
        { sub: "user-1", tenantId: "tenant-1" },
      ),
    ).resolves.toEqual({ recorded: true });
    expect(recordResultInteraction).toHaveBeenCalledWith({
      q: "知识库",
      eventType: "VIEW",
      resultCount: 3,
      documentId: "doc-1",
      interactionToken: "signed-token",
    }, { sub: "user-1", tenantId: "tenant-1" });
    expect(Reflect.getMetadata("rate_limit", method)).toMatchObject({
      windowMs: 60_000,
      max: 20,
      keyPrefix: "search-events",
    });
  });

  it("does not claim an unverified event was recorded", async () => {
    const recordResultInteraction = vi.fn().mockResolvedValue(false);
    const controller = new SearchController({ recordResultInteraction } as any);

    await expect(
      (controller as any).recordEvent(
        { q: "risk", eventType: "VIEW", contentId: "foreign-content" },
        { sub: "user-1", tenantId: "tenant-1" },
      ),
    ).resolves.toEqual({ recorded: false, error: "invalid_event_target" });
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
  it("records only the verified document id for an authorized result interaction", async () => {
    const { service, db, access } = createService();
    db.query
      .mockResolvedValueOnce([{ documentId: "doc-1", categoryId: "folder-1" }])
      .mockResolvedValueOnce([{ id: "event-1" }]);
    access.getAccessFlags.mockResolvedValueOnce({
      "doc-1": { canView: true, canDownload: false },
    });

    await expect(service.recordResultInteraction({
      keyword: "  Risk  ",
      eventType: "VIEW",
      resultCount: 999,
      categoryId: "spoofed-folder",
      documentId: "doc-1",
      contentId: "content-1",
      chunkId: "chunk-1",
      interactionToken: interactionToken(service),
    }, {
      sub: "user-2",
      tenantId: "tenant-1",
      role: "viewer",
    })).resolves.toBe(true);

    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('d.id AS "documentId"'),
      ["tenant-1", "doc-1"],
    );
    const insertValues = db.query.mock.calls[1][1] as unknown[];
    expect(insertValues.slice(1)).toEqual([
      "tenant-1",
      "user-2",
      "risk",
      "folder-1",
      "doc-1",
      "DOCUMENT_VIEW",
    ]);
    expect(String(db.query.mock.calls[1][0])).toContain("ON CONFLICT (id) DO NOTHING");
    expect(String((db.query.mock.calls[1][1] as unknown[])[0])).toMatch(/^search_interaction_[a-f0-9]{64}$/);
  });

  it("rejects forged keywords and cross-user, cross-tenant, or expired tokens before database access", async () => {
    const { service, db, access } = createService();
    const actor = { sub: "user-2", tenantId: "tenant-1", role: "viewer" };
    const attempts = [
      { keyword: "forged", token: interactionToken(service) },
      { keyword: "risk", token: interactionToken(service, { userId: "other-user" }) },
      { keyword: "risk", token: interactionToken(service, { tenantId: "other-tenant" }) },
      { keyword: "risk", token: interactionToken(service, { exp: Math.floor(Date.now() / 1000) - 1 }) },
      { keyword: "risk", token: `${interactionToken(service)}tampered` },
    ];
    for (const attempt of attempts) {
      await expect(service.recordResultInteraction({
        keyword: attempt.keyword,
        eventType: "VIEW",
        documentId: "doc-1",
        interactionToken: attempt.token,
      }, actor)).resolves.toBe(false);
    }

    expect(access.getAccessFlags).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  it("rejects invisible targets and requires download permission for download events", async () => {
    const invisible = createService();
    invisible.db.query.mockResolvedValueOnce([{ documentId: "doc-1", categoryId: null }]);
    invisible.access.getAccessFlags.mockResolvedValueOnce({
      "doc-1": { canView: false, canDownload: false },
    });
    await expect(invisible.service.recordResultInteraction({
      keyword: "risk",
      eventType: "VIEW",
      documentId: "doc-1",
      interactionToken: interactionToken(invisible.service),
    }, { sub: "user-2", tenantId: "tenant-1", role: "viewer" })).resolves.toBe(false);
    expect(invisible.db.query).toHaveBeenCalledTimes(1);

    const noDownload = createService();
    noDownload.db.query.mockResolvedValueOnce([{ documentId: "doc-1", categoryId: null }]);
    noDownload.access.getAccessFlags.mockResolvedValueOnce({
      "doc-1": { canView: true, canDownload: false },
    });
    await expect(noDownload.service.recordResultInteraction({
      keyword: "risk",
      eventType: "DOWNLOAD",
      documentId: "doc-1",
      interactionToken: interactionToken(noDownload.service),
    }, { sub: "user-2", tenantId: "tenant-1", role: "viewer" })).resolves.toBe(false);
    expect(noDownload.db.query).toHaveBeenCalledTimes(1);
  });

  it("atomically de-duplicates repeated interactions in a short window", async () => {
    const { service, db, access } = createService();
    db.query
      .mockResolvedValueOnce([{ documentId: "doc-1", categoryId: null }])
      .mockResolvedValueOnce([{ id: "event-1" }])
      .mockResolvedValueOnce([{ documentId: "doc-1", categoryId: null }])
      .mockResolvedValueOnce([]);
    access.getAccessFlags.mockResolvedValue({
      "doc-1": { canView: true, canDownload: false },
    });

    const event = {
      keyword: "risk",
      eventType: "VIEW",
      documentId: "doc-1",
      interactionToken: interactionToken(service),
    };
    const actor = { sub: "user-2", tenantId: "tenant-1", role: "viewer" };
    await expect(service.recordResultInteraction(event, actor)).resolves.toBe(true);
    await expect(service.recordResultInteraction(event, actor)).resolves.toBe(false);

    expect(String(db.query.mock.calls[1][0])).toContain("ON CONFLICT (id) DO NOTHING");
    expect((db.query.mock.calls[1][1] as unknown[])[0]).toBe(
      (db.query.mock.calls[3][1] as unknown[])[0],
    );
  });

  it("rejects client-generated SEARCH and redundant CLICK events while internal SEARCH recording remains available", async () => {
    const { service, db } = createService();

    await expect(service.recordResultInteraction({
      keyword: "risk",
      eventType: "SEARCH",
      resultCount: 500,
    }, { sub: "user-2", tenantId: "tenant-1", role: "viewer" })).resolves.toBe(false);
    await expect(service.recordResultInteraction({
      keyword: "risk",
      eventType: "CLICK",
      documentId: "doc-1",
      interactionToken: interactionToken(service),
    }, { sub: "user-2", tenantId: "tenant-1", role: "viewer" })).resolves.toBe(false);
    expect(db.query).not.toHaveBeenCalled();

    await service.recordSearchEvent({
      keyword: "risk",
      eventType: "SEARCH",
      resultCount: 3,
      tenantId: "tenant-1",
      userId: "user-2",
    });
    expect(String(db.query.mock.calls[0][0])).toContain("INSERT INTO search_events");
  });

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

describe("service retrieve route guard placement (CALL-06/CALL-10 regression)", () => {
  it("retrieve lives on SearchRetrieveController, not the JWT-guarded SearchController", () => {
    // 若 retrieve 回到 SearchController，会被其类级 AuthGuard('jwt') 挡掉无 JWT 的服务调用。
    expect((SearchController.prototype as any).retrieve).toBeUndefined();
    expect(typeof (SearchRetrieveController.prototype as any).retrieve).toBe("function");
  });

  it("SearchRetrieveController has no class-level guard; retrieve uses ServiceAuthGuard", () => {
    const classGuards = Reflect.getMetadata(GUARDS_METADATA, SearchRetrieveController) ?? [];
    expect(classGuards.length).toBe(0);
    const methodGuards =
      Reflect.getMetadata(GUARDS_METADATA, SearchRetrieveController.prototype.retrieve) ?? [];
    expect(methodGuards.map((g: any) => g?.name ?? g?.constructor?.name)).toContain("ServiceAuthGuard");
    expect(Reflect.getMetadata(PATH_METADATA, SearchRetrieveController.prototype.retrieve)).toBe("retrieve");
    expect(Reflect.getMetadata(METHOD_METADATA, SearchRetrieveController.prototype.retrieve)).toBe(1);
  });
});
