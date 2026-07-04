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
  categoryId: z.string().optional(),
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
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
});
export type GraphWorkspaceResponse = z.infer<typeof GraphWorkspaceResponse>;

export const DocumentEntitiesResponse = z.object({
  documentId: z.string(),
  entities: z.array(GraphNode),
  edges: z.array(GraphEdge),
});
export type DocumentEntitiesResponse = z.infer<typeof DocumentEntitiesResponse>;
