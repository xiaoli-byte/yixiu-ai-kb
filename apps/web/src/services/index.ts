// 重新导出所有服务类型
export type {
  LoginRequest,
  LoginResponse,
  User as AuthUser,
  DocumentDto,
  DocumentDetail,
  DocumentListResponse,
  DocumentQuery,
  DocumentUpdateData,
  Folder,
  CreateFolderData,
  UpdateFolderData,
  GraphNode,
  GraphEdge,
  GraphData,
  GraphSearchQuery,
  Citation,
  ChatMessage,
  Conversation,
  ConversationDetail,
  PdfUrlResponse,
  MarkdownContentResponse,
  SearchHit,
  SearchResponse,
  SearchRequest,
  User,
  CreateUserData,
  UpdateUserData,
  Department,
  CreateDepartmentData,
  UpdateDepartmentData,
} from "@/types/api";

// 默认导出
export { default as authApi } from "./auth";
export { default as documentsApi } from "./documents";
export { default as foldersApi } from "./folders";
export { default as graphApi } from "./graph";
export { default as qaApi } from "./qa";
export { default as searchApi } from "./search";
export { default as usersApi } from "./users";
export { default as departmentsApi } from "./departments";

// 重新导出 API 客户端
export { api as api, apiClient, apiBaseUrl, clearAuth, saveAuth } from "@/lib/api-client";
export { ApiError, RateLimitError, TokenExpiredError } from "@/lib/api-client";
