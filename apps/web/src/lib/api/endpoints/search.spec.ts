import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../client";
import {
  clearSearchHistory,
  deleteSearchHistory,
  getHotSearch,
  getSearchHistory,
  recordSearchEvent,
  search,
  searchList,
} from "./search";
import {
  getHotSearch as serviceGetHotSearch,
  searchList as serviceSearchList,
} from "@/services/search";

vi.mock("../client", () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("search endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends sortBy with search requests", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ hits: [], took: 1 });

    await search({ q: "risk", mode: "keyword", topK: 5, sortBy: "time" });

    expect(apiClient.post).toHaveBeenCalledWith("/search", {
      q: "risk",
      mode: "keyword",
      topK: 5,
      sortBy: "time",
    });
  });

  it("uses tenant-scoped search history endpoints", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce([]);
    vi.mocked(apiClient.delete).mockResolvedValue(undefined);

    await getSearchHistory({ limit: 10 });
    await deleteSearchHistory("history-1");
    await clearSearchHistory();

    expect(apiClient.get).toHaveBeenCalledWith("/search/history", { query: { limit: 10 } });
    expect(apiClient.delete).toHaveBeenCalledWith("/search/history/history-1");
    expect(apiClient.delete).toHaveBeenCalledWith("/search/history");
  });

  it("gets search list with query params", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ query: "risk", mode: "hybrid", total: 0, hits: [], took: 1, page: 1, pageSize: 20, hasMore: false });
    const query = { keyword: "risk", mode: "semantic" as const, page: 2 };

    await searchList(query);

    expect(apiClient.get).toHaveBeenCalledWith("/search", { query });
  });

  it("records result interaction events without using the search endpoint", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ recorded: true });
    const event = { keyword: "risk", eventType: "DOCUMENT_VIEW" as const, resultCount: 3, documentId: "doc-1", chunkId: "chunk-1" };

    await recordSearchEvent(event);

    expect(apiClient.post).toHaveBeenCalledWith("/search/events", event);
  });

  it("gets hot search with query params", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce([]);
    const query = { range: "week" as const, limit: 5 };

    await getHotSearch(query);

    expect(apiClient.get).toHaveBeenCalledWith("/search/hot", { query });
  });

  it("re-exports list wrappers through the search service", () => {
    expect(serviceSearchList).toBe(searchList);
    expect(serviceGetHotSearch).toBe(getHotSearch);
  });
});
