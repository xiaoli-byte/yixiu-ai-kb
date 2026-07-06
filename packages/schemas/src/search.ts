import { z } from "zod";

export const SearchMode = z.enum(["hybrid", "semantic", "keyword"]);
export type SearchMode = z.infer<typeof SearchMode>;

export const SearchQuery = z.object({
  q: z.string().min(1).max(500),
  mode: SearchMode.default("hybrid"),
  topK: z.coerce.number().int().positive().max(50).default(10),
  tags: z.array(z.string()).optional(),
});
export type SearchQuery = z.infer<typeof SearchQuery>;

export const SearchHit = z.object({
  chunkId: z.string(),
  documentId: z.string(),
  contentId: z.string().optional(),
  documentTitle: z.string(),
  idx: z.number().int(),
  text: z.string(),
  highlight: z.string(),
  score: z.number(),
  sources: z.array(z.enum(["bm25", "vector", "trgm"])).default([]),
});
export type SearchHit = z.infer<typeof SearchHit>;

export const SearchResponse = z.object({
  query: z.string(),
  mode: SearchMode,
  total: z.number().int(),
  hits: z.array(SearchHit),
  took: z.number(),
});
export type SearchResponse = z.infer<typeof SearchResponse>;
