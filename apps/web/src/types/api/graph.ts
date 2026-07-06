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
  evidenceSummary?: {
    evidenceCount: number;
    sourceCount?: number;
    maxConfidence?: number | null;
    documentTitles: string[];
  };
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
  documentId?: string;
  entityType?: string;
  relationType?: string;
  categoryId?: string;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
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
  matchedNodeIds: string[];
  centerNodeId: string | null;
  filterOptions: GraphFilterOptions;
}

export interface GraphFilterOptions {
  entityTypes: string[];
  relationTypes: string[];
  documents: Array<{ id: string; title: string }>;
}

export interface GraphEvidenceItem {
  id: string;
  documentContentId: string;
  documentId?: string | null;
  documentTitle?: string | null;
  chunkId?: string | null;
  chunkIdx?: number | null;
  page?: number | null;
  evidenceText?: string | null;
  confidence?: number | null;
  sourceType?: string;
  createdAt: string;
}

export interface GraphEdgeEvidenceResponse {
  edge: {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    sourceName?: string;
    targetName?: string;
    relationType: string;
    weight: number;
    evidenceCount: number;
    sourceCount: number;
    status: string;
    reviewStatus: string;
    sourceType: string;
    updatedAt: string;
  };
  evidences: GraphEvidenceItem[];
}

export interface GraphNodeEvidenceResponse {
  node: GraphNode & {
    aliases: string[];
    mergeStatus?: string;
    mergedIntoNodeId?: string | null;
  };
  evidences: GraphEvidenceItem[];
}

export interface GraphPathResponse {
  found: boolean;
  graph: GraphData;
}

export interface GraphSavedView {
  id: string;
  name: string;
  description?: string | null;
  userId: string;
  visibility: "PRIVATE" | "SHARED";
  filters: Partial<GraphExploreQuery>;
  layout: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SaveGraphViewInput {
  name: string;
  description?: string;
  visibility?: "PRIVATE" | "SHARED";
  filters: Partial<GraphExploreQuery>;
  layout?: Record<string, unknown>;
}
