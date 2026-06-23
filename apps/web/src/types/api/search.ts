// 搜索相关类型
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
