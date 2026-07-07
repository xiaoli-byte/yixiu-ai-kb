import { z } from "zod";

export const DocStatus = z.enum([
  "PENDING",
  "PARSING",
  "CHUNKING",
  "EMBEDDING",
  "READY",
  "FAILED",
]);
export type DocStatus = z.infer<typeof DocStatus>;

export const TagType = z.enum(["MANUAL", "AUTO", "DOMAIN"]);
export type TagType = z.infer<typeof TagType>;

export const Role = z.enum(["super_admin", "admin", "editor", "viewer"]);
export type Role = z.infer<typeof Role>;

export const DocumentPermissionScope = z.enum([
  "PRIVATE",
  "MEMBERS",
  "DEPARTMENTS",
  "COMPANY",
  "PUBLIC",
  "ADMIN",
]);
export type DocumentPermissionScope = z.infer<typeof DocumentPermissionScope>;

export const PermissionSubjectType = z.enum(["USER", "DEPARTMENT", "ROLE"]);
export type PermissionSubjectType = z.infer<typeof PermissionSubjectType>;

export const PermissionMode = z.enum(["APPEND", "OVERWRITE", "DIRECT"]);
export type PermissionMode = z.infer<typeof PermissionMode>;

export const DocumentPermissionEntry = z.object({
  subjectType: PermissionSubjectType,
  subjectId: z.string().min(1),
  canView: z.boolean().default(true),
  canDownload: z.boolean().default(false),
  canEdit: z.boolean().default(false),
  canDelete: z.boolean().default(false),
  canManagePermission: z.boolean().default(false),
});
export type DocumentPermissionEntry = z.infer<typeof DocumentPermissionEntry>;

export const DocumentPermissionUpdateRequest = z.object({
  permissionScope: DocumentPermissionScope,
  entries: z.array(DocumentPermissionEntry).default([]),
  searchable: z.boolean().default(true),
  aiReferenceEnabled: z.boolean().default(true),
  applyToChildren: z.boolean().default(false),
  mode: PermissionMode.default("DIRECT"),
});
export type DocumentPermissionUpdateRequest = z.infer<typeof DocumentPermissionUpdateRequest>;

export const DocumentBatchPermissionUpdateRequest = DocumentPermissionUpdateRequest.extend({
  documentIds: z.array(z.string().min(1)).min(1).max(200).transform((ids) => Array.from(new Set(ids))),
});
export type DocumentBatchPermissionUpdateRequest = z.infer<typeof DocumentBatchPermissionUpdateRequest>;

export const DocumentBatchAction = z.enum(["DOWNLOAD", "DELETE", "MOVE", "ARCHIVE", "RESTORE"]);
export type DocumentBatchAction = z.infer<typeof DocumentBatchAction>;

export const DocumentBatchOperationRequest = z.object({
  action: DocumentBatchAction,
  documentIds: z.array(z.string().min(1)).min(1).max(200),
  folderId: z.string().optional(),
});
export type DocumentBatchOperationRequest = z.infer<typeof DocumentBatchOperationRequest>;

const QueryBoolean = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return value;
}, z.boolean());

export const DocumentDto = z.object({
  id: z.string(),
  title: z.string(),
  mime: z.string(),
  size: z.number().int(),
  status: DocStatus,
  folderId: z.string().nullable(),
  contentId: z.string().nullable().optional(),
  fileHash: z.string().nullable().optional(),
  contentHash: z.string().nullable().optional(),
  duplicateOfDocumentId: z.string().nullable().optional(),
  dedupReason: z.string().nullable().optional(),
  ownerId: z.string(),
  ownerName: z.string().optional(),
  permissionScope: DocumentPermissionScope.default("PRIVATE"),
  searchable: z.boolean().default(true),
  aiReferenceEnabled: z.boolean().default(true),
  archived: z.boolean().default(false),
  deletedAt: z.string().nullable().optional(),
  canView: z.boolean().default(false),
  canDownload: z.boolean().default(false),
  canEdit: z.boolean().default(false),
  canDelete: z.boolean().default(false),
  canManagePermission: z.boolean().default(false),
  tags: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DocumentDto = z.infer<typeof DocumentDto>;

export const DocumentListQuery = z.object({
  q: z.string().optional(),
  status: DocStatus.optional(),
  folderId: z.string().optional(),
  tags: z.string().optional(),
  fileType: z.string().optional(),
  permissionScope: DocumentPermissionScope.optional(),
  uploaderId: z.string().optional(),
  departmentId: z.string().optional(),
  uploadedFrom: z.string().optional(),
  uploadedTo: z.string().optional(),
  archived: QueryBoolean.optional(),
  scope: z.enum(["mine", "public", "department", "archive", "all"]).default("all"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type DocumentListQuery = z.infer<typeof DocumentListQuery>;

export const DocumentListResponse = z.object({
  items: z.array(DocumentDto),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type DocumentListResponse = z.infer<typeof DocumentListResponse>;

export const DocumentChunkDto = z.object({
  id: z.string(),
  idx: z.number().int(),
  text: z.string(),
  tokens: z.number().int(),
});
export type DocumentChunkDto = z.infer<typeof DocumentChunkDto>;

export const DocumentDetail = DocumentDto.extend({
  chunks: z.array(DocumentChunkDto).default([]),
  errorMessage: z.string().nullable().optional(),
});
export type DocumentDetail = z.infer<typeof DocumentDetail>;
