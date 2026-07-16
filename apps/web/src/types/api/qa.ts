// QA/问答相关类型
export interface Citation {
  index: number;
  chunkId: string;
  documentId: string;
  contentId?: string;
  documentTitle: string;
  mime: string;
  snippet: string;
  page: number | null;
  /** 当前用户对该文档的下载权限（服务端实时下发；历史数据可能缺省，缺省视为可下载） */
  canDownload?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  feedback: MessageFeedback;
  createdAt: string;
}

export type MessageFeedbackRating = "up" | "down" | "none";

export interface MessageFeedback {
  rating: MessageFeedbackRating;
  text: string | null;
  updatedAt: string | null;
}

export interface UpdateMessageFeedbackRequest {
  rating: MessageFeedbackRating;
  feedbackText?: string | null;
}

export interface Conversation {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}

export interface ConversationDetail {
  messages: ChatMessage[];
}

export interface MarkdownContentResponse {
  title: string;
  content: string;
  mime: string;
}

/** 解析文本（切片拼接）：Office 在线预览 / 图片 OCR / 音频转写 */
export interface ParsedContentResponse {
  title: string;
  content: string;
  mime: string;
  truncated: boolean;
}

export interface QaDebugRun {
  id: string;
  conversationId: string | null;
  question: string;
  rewrittenQuery: string | null;
  intent: string;
  domain: string;
  facts: unknown[];
  chunks: unknown[];
  toolResult: unknown | null;
  answer: string | null;
  error: string | null;
  createdAt: string;
}

export interface AskRequest {
  q: string;
  conversationId?: string;
  mode?: "hybrid" | "semantic" | "keyword";
  topK?: number;
}
