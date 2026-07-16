// 统一导出所有 API 类型
// Auth types
export type { LoginRequest, LoginResponse, User } from "./auth";

// Document types
export type {
  DocumentBatchAction,
  DocumentBatchOperationRequest,
  DocumentBatchOperationResponse,
  DocumentBatchOperationResult,
  DocumentBatchPermissionUpdateRequest,
  DocumentBatchUploadResponse,
  DocumentBatchUploadResult,
  DocumentDetail,
  DocumentDto,
  DocumentListQuery,
  DocumentListResponse,
  DocumentParseRetryResponse,
  DocumentPermissionEntry,
  DocumentPermissionResponse,
  DocumentPermissionScope,
  DocumentPermissionUpdateRequest,
  DocumentQuery,
  DocumentStatus,
  DocumentUpdateData,
  PermissionMode,
  PermissionSubjectType,
} from "./documents";

// Folder types
export type { Folder, CreateFolderData, UpdateFolderData } from "./folders";

// Graph types
export type {
  GraphCategory,
  GraphData,
  GraphEdge,
  GraphEdgeEvidenceResponse,
  GraphEvidenceItem,
  GraphExploreQuery,
  GraphFilterOptions,
  GraphNode,
  GraphNodeEvidenceResponse,
  GraphPathResponse,
  GraphRecentNode,
  GraphSavedView,
  GraphSearchQuery,
  GraphStats,
  GraphTopNode,
  GraphWorkspaceResponse,
  SaveGraphViewInput,
} from "./graph";

// QA types
export type {
  Citation,
  ChatMessage,
  Conversation,
  ConversationDetail,
  MessageFeedback,
  MessageFeedbackRating,
  MarkdownContentResponse,
  ParsedContentResponse,
  QaDebugRun,
  UpdateMessageFeedbackRequest,
} from "./qa";

// Search types
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
} from "./search";

// User types
export type { User as UserType, CreateUserData, UpdateUserData } from "./users";

// Department types
export type { Department, CreateDepartmentData, UpdateDepartmentData } from "./departments";
