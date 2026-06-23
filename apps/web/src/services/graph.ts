import {
  getGraphTop as topApi,
  searchGraph as searchApi,
} from "@/lib/api/endpoints/graph";

// 类型
export type { GraphNode, GraphEdge, GraphData, GraphSearchQuery } from "@/types/api";

// 导出 API 函数
export const top = topApi;
export { searchApi as search };

// 默认导出
const graphApi = { top, search: searchApi };
export default graphApi;
