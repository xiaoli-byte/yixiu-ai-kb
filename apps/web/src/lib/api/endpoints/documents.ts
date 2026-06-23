import { apiClient } from "../client";

// 请求配置类型
interface RequestConfig {
  query?: Record<string, unknown>;
}

// 获取文档列表
export async function getDocuments(query?: DocumentQuery): Promise<DocumentListResponse> {
  const config: RequestConfig = {};
  if (query) {
    config.query = query as Record<string, unknown>;
  }
  return apiClient.get<DocumentListResponse>("/documents", config);
}

// 获取文档详情
export async function getDocument(id: string): Promise<DocumentDetail> {
  return apiClient.get<DocumentDetail>(`/documents/${id}`);
}

// 更新文档
export async function updateDocument(id: string, data: DocumentUpdateData): Promise<void> {
  return apiClient.patch(`/documents/${id}`, data);
}

// 删除文档
export async function deleteDocument(id: string): Promise<void> {
  return apiClient.delete(`/documents/${id}`);
}

// 上传文档
export async function uploadDocument(formData: FormData): Promise<void> {
  return apiClient.post("/documents/upload", formData);
}

// 添加标签
export async function addDocumentTag(docId: string, tagId: string): Promise<void> {
  return apiClient.post(`/documents/${docId}/tags/${tagId}`);
}

// 移除标签
export async function removeDocumentTag(docId: string, tagId: string): Promise<void> {
  return apiClient.delete(`/documents/${docId}/tags/${tagId}`);
}

// 导入类型
import type { DocumentDto, DocumentDetail, DocumentListResponse, DocumentQuery, DocumentUpdateData } from "@/types/api";
