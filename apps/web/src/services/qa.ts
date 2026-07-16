import {
  getConversations as convListApi,
  getConversation as convGetApi,
  deleteConversation as convDeleteApi,
  getDocumentMarkdown as mdApi,
  getDocumentParsedContent as parsedContentApi,
  getDebugRuns as debugRunsApi,
  getAskEndpoint as askEndpointApi,
  updateMessageFeedback as updateMessageFeedbackApi,
  buildDocumentFileUrl as buildDocumentFileUrlApi,
  buildDocumentDownloadUrl as buildDocumentDownloadUrlApi,
  getDocumentFileBlob as getDocumentFileBlobApi,
} from "@/lib/api/endpoints/qa";

// 类型
export type {
  Citation,
  ChatMessage,
  Conversation,
  ConversationDetail,
  ParsedContentResponse,
  MarkdownContentResponse,
  QaDebugRun,
  MessageFeedback,
  MessageFeedbackRating,
  UpdateMessageFeedbackRequest,
} from "@/types/api";

// 导出 API 函数
export const conversationList = convListApi;
export const conversationGet = convGetApi;
export const conversationDelete = convDeleteApi;
export const getDocumentMarkdown = mdApi;
export const getDocumentParsedContent = parsedContentApi;
export const getDebugRuns = debugRunsApi;
export const getAskEndpoint = askEndpointApi;
export const updateMessageFeedback = updateMessageFeedbackApi;
export const buildDocumentFileUrl = buildDocumentFileUrlApi;
export const buildDocumentDownloadUrl = buildDocumentDownloadUrlApi;
export const getDocumentFileBlob = getDocumentFileBlobApi;

// 默认导出
const qaApi = {
  conversationList,
  conversationGet,
  conversationDelete,
  getDocumentMarkdown,
  getDocumentParsedContent,
  getDebugRuns,
  getAskEndpoint,
  updateMessageFeedback,
  buildDocumentFileUrl,
  buildDocumentDownloadUrl,
  getDocumentFileBlob,
};
export default qaApi;
