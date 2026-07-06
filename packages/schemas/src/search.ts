import { z } from "zod";

export const SearchMode = z.enum(["hybrid", "semantic", "keyword"]);
export type SearchMode = z.infer<typeof SearchMode>;

export const SearchSortBy = z.enum(["relevance", "time", "name"]);
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
