import { apiClient } from "../client";
import type { SearchHistoryItem, SearchRequest, SearchResponse } from "@/types/api";

// 搜索
export async function search(params: SearchRequest): Promise<SearchResponse> {
  return apiClient.post<SearchResponse>("/search", params);
}

export async function getSearchHistory(params: { limit?: number } = {}): Promise<SearchHistoryItem[]> {
  return apiClient.get<SearchHistoryItem[]>("/search/history", { query: { limit: params.limit } });
}

export async function deleteSearchHistory(id: string): Promise<{ deleted: number }> {
  return apiClient.delete<{ deleted: number }>(`/search/history/${id}`);
}

export async function clearSearchHistory(): Promise<{ deleted: number }> {
  return apiClient.delete<{ deleted: number }>("/search/history");
}
