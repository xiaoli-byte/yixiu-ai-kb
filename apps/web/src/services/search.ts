import {
  clearSearchHistory,
  deleteSearchHistory,
  getHotSearch,
  getSearchHistory,
  search as searchEndpoint,
  searchList,
} from "@/lib/api/endpoints/search";

export type {
  HotSearchItem,
  HotSearchQuery,
  SearchEventRequest,
  SearchEventType,
  SearchHit,
  SearchHistoryItem,
  SearchListQuery,
  SearchListResponse,
  SearchMode,
  SearchRequest,
  SearchResponse,
  SearchSortBy,
} from "@/types/api";

export const search = searchEndpoint;

const searchApi = {
  search,
  searchList,
  getHotSearch,
  getSearchHistory,
  deleteSearchHistory,
  clearSearchHistory,
};

export default searchApi;
