import {
  getConversations as convListApi,
  getConversation as convGetApi,
  deleteConversation as convDeleteApi,
  getDocumentPdfUrl as pdfUrlApi,
  getDocumentMarkdown as mdApi,
  getDebugRuns as debugRunsApi,
  getAskEndpoint as askEndpointApi,
} from "@/lib/api/endpoints/qa";

// 类型
export type {
  Citation,
  ChatMessage,
  Conversation,
  ConversationDetail,
  PdfUrlResponse,
  MarkdownContentResponse,
  QaDebugRun,
} from "@/types/api";

// 导出 API 函数
export const conversationList = convListApi;
export const conversationGet = convGetApi;
export const conversationDelete = convDeleteApi;
export const getDocumentPdfUrl = pdfUrlApi;
export const getDocumentMarkdown = mdApi;
export const getDebugRuns = debugRunsApi;
export const getAskEndpoint = askEndpointApi;

// 默认导出
const qaApi = {
  conversationList,
  conversationGet,
  conversationDelete,
  getDocumentPdfUrl,
  getDocumentMarkdown,
  getDebugRuns,
  getAskEndpoint,
};
export default qaApi;
