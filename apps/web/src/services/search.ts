import {
  clearSearchHistory,
  deleteSearchHistory,
  getSearchHistory,
  search as searchEndpoint,
} from "@/lib/api/endpoints/search";

// 类型
export type {
  SearchHit,
  SearchHistoryItem,
  SearchMode,
  SearchRequest,
  SearchResponse,
  SearchSortBy,
} from "@/types/api";

// 导出 API 函数
export const search = searchEndpoint;

// 默认导出
const searchApi = { search, getSearchHistory, deleteSearchHistory, clearSearchHistory };
export default searchApi;
