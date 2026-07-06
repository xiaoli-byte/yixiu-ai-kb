// 图谱相关类型
export interface GraphNode {
  id: string;
  label: string;
  type: "Document" | "Chunk" | "Entity" | "Tag" | "Category";
  val?: number;
  properties?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  weight?: number;
  properties?: Record<string, unknown>;
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

export interface GraphExploreQuery {
  keyword?: string;
  nodeType?: "all" | "Document" | "Entity" | "Tag";
  categoryId?: string;
  createdFrom?: string;
  createdTo?: string;
  depth?: number;
  limit?: number;
}

export interface GraphStats {
  nodeTotal: number;
  edgeTotal: number;
  documentNodeTotal: number;
  entityNodeTotal: number;
  tagNodeTotal: number;
  categoryTotal: number;
}

export interface GraphCategory {
  id: string;
  name: string;
  type?: string;
  documentCount: number;
}

export interface GraphTopNode extends GraphNode {
  relationCount: number;
  documentCount: number;
}

export interface GraphRecentNode extends GraphNode {
  updatedAt: string;
  categoryNames: string[];
}

export interface GraphWorkspaceResponse {
  graph: GraphData;
  stats: GraphStats;
  topNodes: GraphTopNode[];
  recentNodes: GraphRecentNode[];
  categories: GraphCategory[];
}
