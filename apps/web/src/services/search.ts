import {
  clearSearchHistory,
  deleteSearchHistory,
  getHotSearch,
  getSearchHistory,
  recordSearchEvent,
  search as searchEndpoint,
  searchList,
} from "@/lib/api/endpoints/search";

export type {
  HotSearchItem,
  HotSearchQuery,
  SearchEventRequest,
  SearchEventResponse,
  SearchEventType,
  SearchHit,
  SearchHistoryItem,
  SearchListQuery,
  SearchListResponse,
  SearchMode,
  SearchRequest,
  SearchResponse,
  SearchSortBy,
} from "@/types/api/search";

export const search = searchEndpoint;
export { getHotSearch, recordSearchEvent, searchList };

const searchApi = {
  search,
  searchList,
  recordSearchEvent,
  getHotSearch,
  getSearchHistory,
  deleteSearchHistory,
  clearSearchHistory,
};

export default searchApi;
