import { api } from "@/lib/api-client";

export interface SearchHit {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  idx: number;
  text: string;
  highlight: string;
  score: number;
  sources: string[];
}

export interface SearchResponse {
  hits: SearchHit[];
  took: number;
}

export interface SearchRequest {
  q: string;
  mode?: "hybrid" | "semantic" | "keyword";
  topK?: number;
}

export async function search(params: SearchRequest) {
  const res = await api<SearchResponse>("/search", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return res;
}

const searchApi = { search };

export default searchApi;
