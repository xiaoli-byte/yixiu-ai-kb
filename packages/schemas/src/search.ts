import { z } from "zod";

export const SearchMode = z.enum(["hybrid", "semantic", "keyword"]);
export type SearchMode = z.infer<typeof SearchMode>;

export const SearchSortBy = z.enum(["relevance", "time", "name", "updatedAt", "hot", "views", "downloads"]);
export type SearchSortBy = z.infer<typeof SearchSortBy>;

export const SearchQuery = z.object({
  q: z.string().min(1).max(500),
  mode: SearchMode.default("hybrid"),
  sortBy: SearchSortBy.default("relevance"),
  topK: z.coerce.number().int().positive().max(50).default(10),
  tags: z.array(z.string()).optional(),
});
export type SearchQuery = z.infer<typeof SearchQuery>;

export const SearchHit = z.object({
  chunkId: z.string(),
  documentId: z.string(),
  contentId: z.string().optional(),
  documentTitle: z.string(),
  mime: z.string().optional(),
  permissionScope: z.string().optional(),
  canDownload: z.boolean().default(false),
  categoryPath: z.string().nullable().optional(),
  idx: z.number().int(),
  text: z.string(),
  highlight: z.string(),
  score: z.number(),
  sources: z.array(z.enum(["bm25", "vector", "trgm"])).default([]),
  page: z.number().int().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
});
export type SearchHit = z.infer<typeof SearchHit>;

export const SearchListQuery = z.object({
  keyword: z.string().optional(),
  q: z.string().optional(),
  fileType: z.string().optional(),
  categoryId: z.string().optional(),
  tagId: z.string().optional(),
  permissionScope: z.enum(["PRIVATE", "MEMBERS", "DEPARTMENTS", "COMPANY", "PUBLIC", "ADMIN"]).optional(),
  updateTimeRange: z.enum(["all", "today", "7d", "30d", "custom"]).default("all"),
  parseStatus: z.string().optional(),
  uploaderId: z.string().optional(),
  departmentId: z.string().optional(),
  sort: SearchSortBy.default("relevance"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  viewMode: z.enum(["list", "grid"]).default("list"),
});
export type SearchListQuery = z.infer<typeof SearchListQuery>;

export const HotSearchQuery = z.object({
  range: z.enum(["today", "week", "month", "all"]).default("today"),
  categoryId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).default(10),
});
export type HotSearchQuery = z.infer<typeof HotSearchQuery>;

export const HotSearchItem = z.object({
  keyword: z.string(),
  hotScore: z.number(),
  searchCount: z.number().int(),
  clickCount: z.number().int(),
  viewCount: z.number().int(),
  downloadCount: z.number().int(),
  trend: z.enum(["up", "down", "flat"]),
  categoryId: z.string().nullable().optional(),
  pinned: z.boolean().default(false),
});
export type HotSearchItem = z.infer<typeof HotSearchItem>;

export const SearchResponse = z.object({
  query: z.string(),
  mode: SearchMode,
  sortBy: SearchSortBy.default("relevance"),
  total: z.number().int(),
  hits: z.array(SearchHit),
  took: z.number(),
  hasRelevantResults: z.boolean().optional(),
});
export type SearchResponse = z.infer<typeof SearchResponse>;

export const SearchHistoryItem = z.object({
  id: z.string(),
  query: z.string(),
  mode: SearchMode,
  sortBy: SearchSortBy,
  topK: z.number().int(),
  resultCount: z.number().int(),
  createdAt: z.string(),
});
export type SearchHistoryItem = z.infer<typeof SearchHistoryItem>;
