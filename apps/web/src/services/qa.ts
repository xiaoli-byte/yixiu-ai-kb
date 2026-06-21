import { api, apiBaseUrl } from "@/lib/api-client";

export interface Citation {
  index: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  mime: string;
  snippet: string;
  page: number | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}

export interface PdfUrlResponse {
  url: string;
  title: string;
  mime: string;
}

export interface MarkdownContentResponse {
  title: string;
  content: string;
  mime: string;
}

export async function conversationList() {
  const res = await api<Conversation[]>("/qa/conversations");
  return res;
}

export async function conversationGet(id: string) {
  const res = await api<{ messages: ChatMessage[] }>(`/qa/conversations/${id}`);
  return res;
}

export async function conversationDelete(id: string) {
  const res = await api(`/qa/conversations/${id}`, { method: "DELETE" });
  return res;
}

export async function getDocumentPdfUrl(documentId: string) {
  const res = await api<PdfUrlResponse>(`/qa/documents/${documentId}/pdf-url`);
  return res;
}

export async function getDocumentMarkdown(documentId: string) {
  const res = await api<MarkdownContentResponse>(`/qa/documents/${documentId}/markdown`);
  return res;
}

export function getAskEndpoint() {
  return `${apiBaseUrl}/qa/ask`;
}

const qaApi = { conversationList, conversationGet, conversationDelete, getDocumentPdfUrl, getDocumentMarkdown, getAskEndpoint };

export default qaApi;
