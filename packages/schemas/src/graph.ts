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

export const DocumentEntitiesResponse = z.object({
  documentId: z.string(),
  entities: z.array(GraphNode),
  edges: z.array(GraphEdge),
});
export type DocumentEntitiesResponse = z.infer<typeof DocumentEntitiesResponse>;