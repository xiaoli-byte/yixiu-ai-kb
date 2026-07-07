import { apiClient } from "../client";
import type {
  DocumentBatchOperationRequest,
  DocumentBatchOperationResponse,
  DocumentBatchPermissionUpdateRequest,
  DocumentDetail,
  DocumentListResponse,
  DocumentParseRetryResponse,
  DocumentPermissionResponse,
  DocumentPermissionUpdateRequest,
  DocumentQuery,
  DocumentUpdateData,
} from "@/types/api";

// Request config type
interface RequestConfig {
  query?: Record<string, unknown>;
}

// Get document list
export async function getDocuments(query?: DocumentQuery): Promise<DocumentListResponse> {
  const config: RequestConfig = {};
  if (query) {
    config.query = query as Record<string, unknown>;
  }
  return apiClient.get<DocumentListResponse>("/documents", config);
}

// Get document detail
export async function getDocument(id: string): Promise<DocumentDetail> {
  return apiClient.get<DocumentDetail>(`/documents/${id}`);
}

export async function getDocumentPermissions(id: string): Promise<DocumentPermissionResponse> {
  return apiClient.get<DocumentPermissionResponse>(`/documents/${id}/permissions`);
}

export async function setDocumentPermissions(
  id: string,
  body: DocumentPermissionUpdateRequest
): Promise<DocumentPermissionResponse> {
  return apiClient.put<DocumentPermissionResponse>(`/documents/${id}/permissions`, body);
}

export async function setBatchDocumentPermissions(
  body: DocumentBatchPermissionUpdateRequest
): Promise<DocumentBatchOperationResponse> {
  return apiClient.put<DocumentBatchOperationResponse>("/documents/batch/permissions", body);
}

export const setBatchPermissions = setBatchDocumentPermissions;

export async function batchDocuments(
  body: DocumentBatchOperationRequest
): Promise<DocumentBatchOperationResponse> {
  return apiClient.post<DocumentBatchOperationResponse>("/documents/batch", body);
}

export async function retryDocumentParse(id: string): Promise<DocumentParseRetryResponse> {
  return apiClient.post<DocumentParseRetryResponse>(`/documents/${id}/parse/retry`);
}

export const retryParse = retryDocumentParse;

// Update document
export async function updateDocument(id: string, data: DocumentUpdateData): Promise<void> {
  return apiClient.patch(`/documents/${id}`, data);
}

// Delete document
export async function deleteDocument(id: string): Promise<void> {
  return apiClient.delete(`/documents/${id}`);
}

// Upload document
export async function uploadDocument(formData: FormData): Promise<void> {
  return apiClient.post("/documents/upload", formData);
}

// Add tag
export async function addDocumentTag(docId: string, tagId: string): Promise<void> {
  return apiClient.post(`/documents/${docId}/tags/${tagId}`);
}

// Remove tag
export async function removeDocumentTag(docId: string, tagId: string): Promise<void> {
  return apiClient.delete(`/documents/${docId}/tags/${tagId}`);
}
