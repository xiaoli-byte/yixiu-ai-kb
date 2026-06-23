import { search as searchEndpoint } from "@/lib/api/endpoints/search";

// 类型
export type { SearchHit, SearchResponse, SearchRequest } from "@/types/api";

// 导出 API 函数
export const search = searchEndpoint;

// 默认导出
const searchApi = { search };
export default searchApi;
