// Search API types
import type { DocumentPermissionScope } from "./documents";

export type SearchMode = "hybrid" | "semantic" | "keyword";
export type SearchSortBy = "relevance" | "time" | "name" | "updatedAt" | "hot" | "views" | "downloads";

export interface SearchHit {
  chunkId: string;
  documentId: string;
  contentId?: string;
  documentTitle: string;
  mime?: string;
  permissionScope?: DocumentPermissionScope | string;
  canDownload?: boolean;
  categoryPath?: string | null;
  idx: number;
  text: string;
  highlight: string;
  score: number;
  sources: string[];
  page?: number | null;
  hotScore?: number;
  viewCount?: number;
  downloadCount?: number;
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
  page?: number;
  pageSize?: number;
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

export interface SearchListQuery {
  keyword?: string;
  q?: string;
  fileType?: string;
  categoryId?: string;
  permissionScope?: DocumentPermissionScope;
  updateTimeRange?: "all" | "today" | "7d" | "30d" | "custom";
  parseStatus?: string;
  uploaderId?: string;
  departmentId?: string;
  sort?: SearchSortBy;
  page?: number;
  pageSize?: number;
  viewMode?: "list" | "grid";
}

export interface SearchListResponse {
  query: string;
  sortBy: SearchSortBy;
  total: number;
  hits: SearchHit[];
  took: number;
  page: number;
  pageSize: number;
  hasRelevantResults?: boolean;
}

export interface HotSearchQuery {
  range?: "today" | "week" | "month" | "all";
  categoryId?: string;
  limit?: number;
}

export interface HotSearchItem {
  keyword: string;
  hotScore: number;
  searchCount: number;
  clickCount: number;
  viewCount: number;
  downloadCount: number;
  trend: "up" | "down" | "flat";
  categoryId?: string | null;
  pinned: boolean;
}

export type SearchEventType =
  | "SEARCH"
  | "RESULT_CLICK"
  | "CLICK"
  | "DOCUMENT_VIEW"
  | "VIEW"
  | "DOCUMENT_DOWNLOAD"
  | "DOWNLOAD";

export interface SearchEventRequest {
  keyword?: string;
  q?: string;
  eventType?: SearchEventType;
  resultCount?: number;
  categoryId?: string | null;
  documentId?: string | null;
  contentId?: string | null;
  chunkId?: string | null;
}
