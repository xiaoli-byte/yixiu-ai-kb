import { apiClient, apiBaseUrl } from "../client";
import type {
  Conversation,
  ConversationDetail,
  MessageFeedback,
  PdfUrlResponse,
  MarkdownContentResponse,
  QaDebugRun,
  UpdateMessageFeedbackRequest,
} from "@/types/api";

// 获取会话列表
export async function getConversations(): Promise<Conversation[]> {
  return apiClient.get<Conversation[]>("/qa/conversations");
}

// 获取会话详情
export async function getConversation(
  id: string
): Promise<ConversationDetail> {
  return apiClient.get<ConversationDetail>(`/qa/conversations/${id}`);
}

// 删除会话
export async function deleteConversation(id: string): Promise<void> {
  return apiClient.delete(`/qa/conversations/${id}`);
}

export function buildMessageFeedbackPayload(
  input: UpdateMessageFeedbackRequest,
): UpdateMessageFeedbackRequest {
  if (input.rating === "none") {
    return { rating: "none" };
  }

  const feedbackText = (input.feedbackText || "").trim();
  return {
    rating: input.rating,
    ...(feedbackText ? { feedbackText } : {}),
  };
}

export async function updateMessageFeedback(
  messageId: string,
  input: UpdateMessageFeedbackRequest,
): Promise<MessageFeedback> {
  return apiClient.patch<MessageFeedback>(
    `/qa/messages/${encodeURIComponent(messageId)}/feedback`,
    buildMessageFeedbackPayload(input),
  );
}

// 获取文档 PDF URL
export async function getDocumentPdfUrl(
  documentId: string
): Promise<PdfUrlResponse> {
  return apiClient.get<PdfUrlResponse>(
    `/qa/documents/${documentId}/pdf-url`
  );
}

// 获取文档 Markdown 内容
export async function getDocumentMarkdown(
  documentId: string
): Promise<MarkdownContentResponse> {
  return apiClient.get<MarkdownContentResponse>(
    `/qa/documents/${documentId}/markdown`
  );
}

export async function getDebugRuns(params?: {
  conversationId?: string | null;
  limit?: number;
}): Promise<QaDebugRun[]> {
  return apiClient.get<QaDebugRun[]>("/qa/debug/runs", {
    query: {
      conversationId: params?.conversationId || undefined,
      limit: params?.limit,
    },
  });
}

// 获取问答接口地址（用于 SSE 流式请求）
export function getAskEndpoint(): string {
  return `${apiBaseUrl}/qa/ask`;
}
