// Re-export types from all services
export type { LoginRequest, LoginResponse } from "./auth";
export type { DocumentDto, DocumentDetail, DocumentListResponse, DocumentQuery, DocumentUpdateData } from "./documents";
export type { Folder, CreateFolderData, UpdateFolderData } from "./folders";
export type { Tag, CreateTagData } from "./tags";
export type { GraphNode, GraphEdge, GraphData, GraphSearchQuery } from "./graph";
export type { Citation, ChatMessage, Conversation, PdfUrlResponse } from "./qa";
export type { SearchHit, SearchResponse, SearchRequest } from "./search";
export type { User, CreateUserData, UpdateUserData } from "./users";
export type { Department, CreateDepartmentData, UpdateDepartmentData } from "./departments";

// Default exports
export { default as authApi } from "./auth";
export { default as documentsApi } from "./documents";
export { default as foldersApi } from "./folders";
export { default as tagsApi } from "./tags";
export { default as graphApi } from "./graph";
export { default as qaApi } from "./qa";
export { default as searchApi } from "./search";
export { default as usersApi } from "./users";
export { default as departmentsApi } from "./departments";
