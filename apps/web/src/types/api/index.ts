// 统一导出所有 API 类型
// Auth types
export type { LoginRequest, LoginResponse, User } from "./auth";

// Document types
export type { DocumentDto, DocumentDetail, DocumentListResponse, DocumentQuery, DocumentUpdateData, DocumentTag } from "./documents";

// Folder types
export type { Folder, CreateFolderData, UpdateFolderData } from "./folders";

// Tag types
export type { Tag, CreateTagData } from "./tags";

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
  PdfUrlResponse,
  QaDebugRun,
  UpdateMessageFeedbackRequest,
} from "./qa";

// Search types
export type { SearchHit, SearchResponse, SearchRequest, SearchHistoryItem, SearchMode, SearchSortBy } from "./search";

// User types
export type { User as UserType, CreateUserData, UpdateUserData } from "./users";

// Department types
export type { Department, CreateDepartmentData, UpdateDepartmentData } from "./departments";
