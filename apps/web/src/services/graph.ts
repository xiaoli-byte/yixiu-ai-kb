import {
  getGraphWorkspace as workspaceApi,
  getGraphTop as topApi,
  searchGraph as searchApi,
} from "@/lib/api/endpoints/graph";

// 类型
export type {
  GraphCategory,
  GraphData,
  GraphEdge,
  GraphExploreQuery,
  GraphNode,
  GraphRecentNode,
  GraphSearchQuery,
  GraphStats,
  GraphTopNode,
  GraphWorkspaceResponse,
} from "@/types/api";

// 导出 API 函数
export const top = topApi;
export { searchApi as search, workspaceApi as workspace };

// 默认导出
const graphApi = { top, search: searchApi, workspace: workspaceApi };
export default graphApi;
