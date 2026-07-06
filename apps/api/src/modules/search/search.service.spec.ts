import { describe, expect, it, vi } from "vitest";
import { SearchQuery } from "@ai-knowledge/schemas";
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
