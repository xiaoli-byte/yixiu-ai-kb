import { api } from "@/lib/api-client";

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  val?: number;
  properties?: any;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphSearchQuery {
  keyword: string;
  type?: "Entity" | "Tag" | "Document";
  depth?: number;
  limit?: number;
}

export async function top(limit: number = 30) {
  const res = await api<GraphNode[]>("/graph/top", {
    query: { limit },
  });
  return res;
}

export async function search(params: GraphSearchQuery) {
  const res = await api<GraphData>("/graph/search", {
    query: params,
  });
  return res;
}

const graphApi = { top, search };

export default graphApi;
