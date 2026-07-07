// Document API types
export type DocumentStatus =
  | "PENDING"
  | "PARSING"
  | "CHUNKING"
  | "EMBEDDING"
  | "READY"
  | "FAILED";

export type DocumentPermissionScope =
  | "PRIVATE"
  | "MEMBERS"
  | "DEPARTMENTS"
  | "COMPANY"
  | "PUBLIC"
  | "ADMIN";

export type PermissionSubjectType = "USER" | "DEPARTMENT" | "ROLE";
export type PermissionMode = "APPEND" | "OVERWRITE" | "DIRECT";
export type DocumentBatchAction = "DOWNLOAD" | "DELETE" | "MOVE" | "ARCHIVE" | "RESTORE";

export interface DocumentTag {
  id: string;
  name: string;
}

export interface DocumentPermissionEntry {
  subjectType: PermissionSubjectType;
  subjectId: string;
  canView: boolean;
  canDownload: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManagePermission: boolean;
}

export interface DocumentPermissionUpdateRequest {
  permissionScope: DocumentPermissionScope;
  entries?: DocumentPermissionEntry[];
  searchable?: boolean;
  aiReferenceEnabled?: boolean;
  applyToChildren?: boolean;
  mode?: PermissionMode;
}

export interface DocumentPermissionResponse {
  permissionScope: DocumentPermissionScope;
  entries: DocumentPermissionEntry[];
  searchable: boolean;
  aiReferenceEnabled: boolean;
}

export interface DocumentBatchPermissionUpdateRequest extends DocumentPermissionUpdateRequest {
  documentIds: string[];
}

export interface DocumentBatchOperationRequest {
  action: DocumentBatchAction;
  documentIds: string[];
  folderId?: string;
}

export interface DocumentBatchOperationResult {
  documentId: string;
  success: boolean;
  error?: string;
}

export interface DocumentBatchOperationResponse {
  action?: DocumentBatchAction;
  results: DocumentBatchOperationResult[];
}

export interface DocumentDto {
  id: string;
  title: string;
  mime: string;
  size: number;
  status: DocumentStatus;
  folderId: string | null;
  contentId?: string | null;
  fileHash?: string | null;
  contentHash?: string | null;
  duplicateOfDocumentId?: string | null;
  dedupReason?: string | null;
  ownerId: string;
  ownerName?: string;
  permissionScope: DocumentPermissionScope;
  searchable: boolean;
  aiReferenceEnabled: boolean;
  archived: boolean;
  deletedAt?: string | null;
  canView: boolean;
  canDownload: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManagePermission: boolean;
  tags: DocumentTag[];
  createdAt: string;
  updatedAt: string;
}

export interface DocumentChunk {
  id: string;
  idx: number;
  text: string;
  tokens: number;
}

export interface DocumentDetail extends DocumentDto {
  chunks: DocumentChunk[];
  errorMessage?: string;
}

export interface DocumentListResponse {
  items: DocumentDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DocumentListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: DocumentStatus;
  folderId?: string;
  tags?: string;
  fileType?: string;
  permissionScope?: DocumentPermissionScope;
  uploaderId?: string;
  departmentId?: string;
  uploadedFrom?: string;
  uploadedTo?: string;
  archived?: boolean;
  scope?: "mine" | "public" | "department" | "archive" | "all";
}

export type DocumentQuery = DocumentListQuery;

export interface DocumentUpdateData {
  title?: string;
  folderId?: string | null;
}
