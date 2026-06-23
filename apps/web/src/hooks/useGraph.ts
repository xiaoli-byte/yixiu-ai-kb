import useSWR, { SWRConfiguration } from "swr";
import { getGraphTop, searchGraph } from "@/lib/api/endpoints/graph";
import type { GraphNode, GraphData, GraphSearchQuery } from "@/types/api";

// 获取 Top 节点
export function useGraphTop(
  limit: number = 30,
  config?: SWRConfiguration<GraphNode[]>
) {
  return useSWR<GraphNode[]>(
    ["/graph/top", limit],
    () => getGraphTop(limit),
    {
      revalidateOnFocus: false,
      ...config,
    }
  );
}

// 搜索图谱
export function useGraphSearch(
  params: GraphSearchQuery | null,
  config?: SWRConfiguration<GraphData>
) {
  return useSWR<GraphData>(
    params ? ["/graph/search", params] : null,
    () => searchGraph(params!),
    {
      revalidateOnFocus: false,
      ...config,
    }
  );
}
