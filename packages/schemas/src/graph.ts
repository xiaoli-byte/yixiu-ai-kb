import { z } from "zod";

export const GraphNode = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["Document", "Chunk", "Entity", "Tag"]),
  properties: z.record(z.string(), z.any()).default({}),
  // 可视化辅助字段
  val: z.number().optional(),
});
export type GraphNode = z.infer<typeof GraphNode>;

export const GraphEdge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string(),
  weight: z.number().optional(),
  properties: z.record(z.string(), z.any()).optional(),
  evidenceSummary: z
    .object({
      evidenceCount: z.number(),
      sourceCount: z.number().optional(),
      maxConfidence: z.number().nullable().optional(),
      documentTitles: z.array(z.string()).default([]),
    })
    .optional(),
});
export type GraphEdge = z.infer<typeof GraphEdge>;

export const GraphSubgraph = z.object({
  nodes: z.array(GraphNode),
  edges: z.array(GraphEdge),
});
export type GraphSubgraph = z.infer<typeof GraphSubgraph>;

export const GraphSearchQuery = z.object({
  keyword: z.string().min(1).max(100),
  type: z.enum(["Entity", "Tag", "Document"]).default("Entity"),
  limit: z.coerce.number().int().positive().max(100).default(20),
  depth: z.coerce.number().int().min(1).max(3).default(2),
});
export type GraphSearchQuery = z.infer<typeof GraphSearchQuery>;

export const GraphExploreQuery = z.object({
  keyword: z.string().max(100).optional(),
  nodeType: z.enum(["all", "Document", "Entity", "Tag"]).default("all"),
  documentId: z.string().optional(),
  entityType: z.string().optional(),
  relationType: z.string().optional(),
  categoryId: z.string().optional(),
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
  limit: z.coerce.number().int().positive().max(150).default(80),
  depth: z.coerce.number().int().min(1).max(3).default(2),
});
export type GraphExploreQuery = z.infer<typeof GraphExploreQuery>;

export const GraphStats = z.object({
  nodeTotal: z.number(),
  edgeTotal: z.number(),
  documentNodeTotal: z.number(),
  entityNodeTotal: z.number(),
  tagNodeTotal: z.number(),
  categoryTotal: z.number(),
});
export type GraphStats = z.infer<typeof GraphStats>;

export const GraphCategory = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  documentCount: z.number(),
});
export type GraphCategory = z.infer<typeof GraphCategory>;

export const GraphTopNode = GraphNode.extend({
  relationCount: z.number().default(0),
  documentCount: z.number().default(0),
});
export type GraphTopNode = z.infer<typeof GraphTopNode>;

export const GraphRecentNode = GraphNode.extend({
  updatedAt: z.string(),
  categoryNames: z.array(z.string()).default([]),
});
export type GraphRecentNode = z.infer<typeof GraphRecentNode>;

export const GraphWorkspaceResponse = z.object({
  graph: GraphSubgraph,
  stats: GraphStats,
  topNodes: z.array(GraphTopNode),
  recentNodes: z.array(GraphRecentNode),
  categories: z.array(GraphCategory),
  matchedNodeIds: z.array(z.string()).default([]),
  centerNodeId: z.string().nullable().default(null),
  filterOptions: z
    .object({
      entityTypes: z.array(z.string()).default([]),
      relationTypes: z.array(z.string()).default([]),
      documents: z
        .array(
          z.object({
            id: z.string(),
            title: z.string(),
          }),
        )
        .default([]),
    })
    .default({ entityTypes: [], relationTypes: [], documents: [] }),
});
export type GraphWorkspaceResponse = z.infer<typeof GraphWorkspaceResponse>;

export const DocumentEntitiesResponse = z.object({
  documentId: z.string(),
  entities: z.array(GraphNode),
  edges: z.array(GraphEdge),
});
export type DocumentEntitiesResponse = z.infer<typeof DocumentEntitiesResponse>;

export const GraphEvidenceItem = z.object({
  id: z.string(),
  documentContentId: z.string(),
  documentId: z.string().nullable().optional(),
  documentTitle: z.string().nullable().optional(),
  chunkId: z.string().nullable().optional(),
  chunkIdx: z.number().nullable().optional(),
  page: z.number().nullable().optional(),
  evidenceText: z.string().nullable().optional(),
  confidence: z.number().nullable().optional(),
  sourceType: z.string().optional(),
  createdAt: z.string(),
});
export type GraphEvidenceItem = z.infer<typeof GraphEvidenceItem>;

export const GraphEdgeEvidenceResponse = z.object({
  edge: z.object({
    id: z.string(),
    sourceNodeId: z.string(),
    targetNodeId: z.string(),
    sourceName: z.string().optional(),
    targetName: z.string().optional(),
    relationType: z.string(),
    weight: z.number(),
    evidenceCount: z.number(),
    sourceCount: z.number(),
    status: z.string(),
    reviewStatus: z.string(),
    sourceType: z.string(),
    updatedAt: z.string(),
  }),
  evidences: z.array(GraphEvidenceItem),
});
export type GraphEdgeEvidenceResponse = z.infer<typeof GraphEdgeEvidenceResponse>;

export const GraphNodeEvidenceResponse = z.object({
  node: GraphNode.extend({
    aliases: z.array(z.string()).default([]),
    mergeStatus: z.string().optional(),
    mergedIntoNodeId: z.string().nullable().optional(),
  }),
  evidences: z.array(GraphEvidenceItem),
});
export type GraphNodeEvidenceResponse = z.infer<typeof GraphNodeEvidenceResponse>;

export const GraphPathQuery = z.object({
  sourceId: z.string(),
  targetId: z.string(),
  maxDepth: z.coerce.number().int().min(1).max(5).default(3),
});
export type GraphPathQuery = z.infer<typeof GraphPathQuery>;

export const GraphPathResponse = z.object({
  found: z.boolean(),
  graph: GraphSubgraph,
});
export type GraphPathResponse = z.infer<typeof GraphPathResponse>;

export const GraphSavedView = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  userId: z.string(),
  visibility: z.enum(["PRIVATE", "SHARED"]),
  filters: GraphExploreQuery.partial(),
  layout: z.record(z.string(), z.any()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GraphSavedView = z.infer<typeof GraphSavedView>;
