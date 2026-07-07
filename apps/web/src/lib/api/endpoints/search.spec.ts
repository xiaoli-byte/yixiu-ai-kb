import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../client";
import {
  clearSearchHistory,
  deleteSearchHistory,
  getHotSearch,
  getSearchHistory,
  search,
  searchList,
} from "./search";

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
    vi.mocked(apiClient.get).mockResolvedValueOnce({ query: "risk", total: 0, hits: [], took: 1, page: 1, pageSize: 20 });
    const query = { keyword: "risk", page: 1 };

    await searchList(query);

    expect(apiClient.get).toHaveBeenCalledWith("/search", { query });
  });

  it("gets hot search with query params", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce([]);
    const query = { range: "week" as const, limit: 5 };

    await getHotSearch(query);

    expect(apiClient.get).toHaveBeenCalledWith("/search/hot", { query });
  });
});
