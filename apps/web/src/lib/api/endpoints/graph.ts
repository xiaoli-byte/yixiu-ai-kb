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

// 导入类型
import type {
  GraphData,
  GraphExploreQuery,
  GraphNode,
  GraphSearchQuery,
  GraphWorkspaceResponse,
} from "@/types/api";
