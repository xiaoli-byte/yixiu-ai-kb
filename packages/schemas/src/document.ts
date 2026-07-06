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
  tags: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DocumentDto = z.infer<typeof DocumentDto>;

export const DocumentListQuery = z.object({
  q: z.string().optional(),
  status: DocStatus.optional(),
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
