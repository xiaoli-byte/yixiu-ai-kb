import { apiClient } from "../client";
import type {
  HotSearchItem,
  HotSearchQuery,
  SearchHistoryItem,
  SearchEventRequest,
  SearchEventResponse,
  SearchListQuery,
  SearchListResponse,
  SearchRequest,
  SearchResponse,
} from "@/types/api/search";

// 搜索
export async function search(params: SearchRequest): Promise<SearchResponse> {
  return apiClient.post<SearchResponse>("/search", params);
}

export async function searchList(query: SearchListQuery = {}): Promise<SearchListResponse> {
  return apiClient.get<SearchListResponse>("/search", { query: query as Record<string, unknown> });
}

export async function recordSearchEvent(event: SearchEventRequest): Promise<SearchEventResponse> {
  return apiClient.post<SearchEventResponse>("/search/events", event);
}

export async function getHotSearch(query: HotSearchQuery = {}): Promise<HotSearchItem[]> {
  return apiClient.get<HotSearchItem[]>("/search/hot", { query: query as Record<string, unknown> });
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
