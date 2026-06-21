import { api } from "@/lib/api-client";

export interface DocumentDto {
  id: string;
  title: string;
  mime: string;
  size: number;
  status: string;
  folderId: string | null;
  ownerId: string;
  ownerName?: string;
  tags: { id: string; name: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface DocumentDetail extends DocumentDto {
  chunks: { id: string; idx: number; text: string; tokens: number }[];
  errorMessage?: string;
}

export interface DocumentListResponse {
  items: DocumentDto[];
  total: number;
}

export interface DocumentQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: string;
  folderId?: string;
  tags?: string;
}

export interface DocumentUpdateData {
  title?: string;
  folderId?: string | null;
}

export async function list(query?: DocumentQuery) {
  const res = await api<DocumentListResponse>("/documents", { query });
  return res;
}

export async function get(id: string) {
  const res = await api<DocumentDetail>(`/documents/${id}`);
  return res;
}

export async function update(id: string, data: DocumentUpdateData) {
  const res = await api(`/documents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res;
}

export async function remove(id: string) {
  const res = await api(`/documents/${id}`, { method: "DELETE" });
  return res;
}

export async function upload(formData: FormData) {
  const res = await api("/documents/upload", {
    method: "POST",
    body: formData,
  });
  return res;
}

export async function addTag(docId: string, tagId: string) {
  const res = await api(`/documents/${docId}/tags/${tagId}`, { method: "POST" });
  return res;
}

export async function removeTag(docId: string, tagId: string) {
  const res = await api(`/documents/${docId}/tags/${tagId}`, { method: "DELETE" });
  return res;
}

const documentsApi = { list, get, update, remove, upload, addTag, removeTag };

export default documentsApi;
