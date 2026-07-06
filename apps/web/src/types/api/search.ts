// 搜索相关类型
export type SearchMode = "hybrid" | "semantic" | "keyword";
export type SearchSortBy = "relevance" | "time" | "name";

export interface SearchHit {
  chunkId: string;
  documentId: string;
  contentId?: string;
  documentTitle: string;
  mime?: string;
  idx: number;
  text: string;
  highlight: string;
  score: number;
  sources: string[];
  page?: number | null;
  updatedAt?: string | null;
  createdAt?: string | null;
}

export interface SearchResponse {
  query: string;
  mode: SearchMode;
  sortBy: SearchSortBy;
  total: number;
  hits: SearchHit[];
  took: number;
  hasRelevantResults?: boolean;
}

export interface SearchRequest {
  q: string;
  mode?: SearchMode;
  sortBy?: SearchSortBy;
  topK?: number;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  mode: SearchMode;
  sortBy: SearchSortBy;
  topK: number;
  resultCount: number;
  createdAt: string;
}
