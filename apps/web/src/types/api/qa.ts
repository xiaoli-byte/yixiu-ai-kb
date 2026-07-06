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

export interface ConversationDetail {
  messages: ChatMessage[];
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
