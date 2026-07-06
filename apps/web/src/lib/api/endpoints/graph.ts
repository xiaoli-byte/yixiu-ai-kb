import { apiClient } from "../client";

// 请求配置类型
interface RequestConfig {
  query?: Record<string, unknown>;
}

// 获取 Top 节点
export async function getGraphTop(limit: number = 30): Promise<GraphNode[]> {
  return apiClient.get<GraphNode[]>("/graph/top", { query: { limit } });
}

// 获取知识图谱工作台数据
export async function getGraphWorkspace(
  params: GraphExploreQuery = {},
): Promise<GraphWorkspaceResponse> {
  return apiClient.get<GraphWorkspaceResponse>("/graph/explore", {
    query: params as unknown as Record<string, unknown>,
  });
}

// 搜索图谱
export async function searchGraph(params: GraphSearchQuery): Promise<GraphData> {
  return apiClient.get<GraphData>("/graph/search", {
    query: params as unknown as Record<string, unknown>
  });
}

export async function getGraphEdgeEvidence(id: string): Promise<GraphEdgeEvidenceResponse> {
  return apiClient.get<GraphEdgeEvidenceResponse>(`/graph/edges/${id}/evidence`);
}

export async function getGraphNodeEvidence(id: string): Promise<GraphNodeEvidenceResponse> {
  return apiClient.get<GraphNodeEvidenceResponse>(`/graph/nodes/${id}/evidence`);
}

export async function getGraphPath(params: {
  sourceId: string;
  targetId: string;
  maxDepth?: number;
}): Promise<GraphPathResponse> {
  return apiClient.get<GraphPathResponse>("/graph/path", {
    query: params,
  });
}

export async function listGraphViews(): Promise<GraphSavedView[]> {
  return apiClient.get<GraphSavedView[]>("/graph/views");
}

export async function saveGraphView(input: SaveGraphViewInput): Promise<GraphSavedView> {
  return apiClient.post<GraphSavedView>("/graph/views", input);
}

export async function updateGraphView(
  id: string,
  input: Partial<SaveGraphViewInput>,
): Promise<GraphSavedView> {
  return apiClient.patch<GraphSavedView>(`/graph/views/${id}`, input);
}

export async function deleteGraphView(id: string): Promise<{ id: string }> {
  return apiClient.delete<{ id: string }>(`/graph/views/${id}`);
}

export async function mergeGraphEntity(
  sourceId: string,
  input: { targetNodeId: string; aliases?: string[]; reason?: string },
): Promise<GraphNodeEvidenceResponse> {
  return apiClient.post<GraphNodeEvidenceResponse>(`/graph/entities/${sourceId}/merge`, input);
}

export async function updateGraphAliases(
  id: string,
  input: { aliases: string[]; reason?: string },
): Promise<GraphNodeEvidenceResponse> {
  return apiClient.patch<GraphNodeEvidenceResponse>(`/graph/entities/${id}/aliases`, input);
}

export async function createGraphRelation(input: {
  sourceNodeId: string;
  targetNodeId: string;
  relationType: string;
  evidenceText?: string;
  documentContentId?: string;
  documentId?: string;
  chunkId?: string;
  reason?: string;
}): Promise<GraphEdgeEvidenceResponse> {
  return apiClient.post<GraphEdgeEvidenceResponse>("/graph/relations", input);
}

export async function updateGraphRelation(
  id: string,
  input: { relationType?: string; reason?: string; reviewStatus?: string },
): Promise<GraphEdgeEvidenceResponse> {
  return apiClient.patch<GraphEdgeEvidenceResponse>(`/graph/relations/${id}`, input);
}

export async function reviewGraphRelation(
  id: string,
  input: { reviewStatus: "APPROVED" | "REJECTED" | "PENDING"; reason?: string },
): Promise<GraphEdgeEvidenceResponse> {
  return apiClient.patch<GraphEdgeEvidenceResponse>(`/graph/relations/${id}/review`, input);
}

export async function deleteGraphRelation(
  id: string,
  input?: { reason?: string },
): Promise<{ id: string }> {
  return apiClient.delete<{ id: string }>(`/graph/relations/${id}`, {
    query: input,
  });
}

// 导入类型
import type {
  GraphData,
  GraphEdgeEvidenceResponse,
  GraphExploreQuery,
  GraphNodeEvidenceResponse,
  GraphNode,
  GraphPathResponse,
  GraphSavedView,
  GraphSearchQuery,
  GraphWorkspaceResponse,
  SaveGraphViewInput,
} from "@/types/api";
