import { apiClient } from "../client";
import type { SearchRequest, SearchResponse } from "@/types/api";

// 搜索
export async function search(params: SearchRequest): Promise<SearchResponse> {
  return apiClient.post<SearchResponse>("/search", params);
}
