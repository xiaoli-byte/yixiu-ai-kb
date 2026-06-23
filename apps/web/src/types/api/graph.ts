// 图谱相关类型
export interface GraphNode {
  id: string;
  label: string;
  type: string;
  val?: number;
  properties?: Record<string, unknown>;
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
