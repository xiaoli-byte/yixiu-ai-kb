import { z } from "zod";

export const Citation = z.object({
  index: z.number().int(),
  chunkId: z.string(),
  documentId: z.string(),
  documentTitle: z.string(),
  snippet: z.string(),
});
export type Citation = z.infer<typeof Citation>;

export const AskRequest = z.object({
  // 前端新会话显式发送 null，这里接受 null/undefined 并统一归一为 undefined
  conversationId: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  // trim 后再校验：拒绝空串/纯空白，并统一去除首尾空白
  question: z.string().trim().min(1).max(2000),
  topK: z.coerce.number().int().positive().max(20).default(5),
});
export type AskRequest = z.infer<typeof AskRequest>;

export const AskChunkEvent = z.object({
  type: z.literal("chunk"),
  content: z.string(),
});
export type AskChunkEvent = z.infer<typeof AskChunkEvent>;

export const AskCitationEvent = z.object({
  type: z.literal("citations"),
  citations: z.array(Citation),
});
export type AskCitationEvent = z.infer<typeof AskCitationEvent>;

export const AskDoneEvent = z.object({
  type: z.literal("done"),
  messageId: z.string(),
  conversationId: z.string(),
});
export type AskDoneEvent = z.infer<typeof AskDoneEvent>;

/**
 * 会话已确保存在、LLM 开始生成之前发送的早发事件。
 * 前端据此在流式开始前就拿到 conversationId（新建会话尤其需要）。
 */
export const AskConversationEvent = z.object({
  type: z.literal("conversation"),
  conversationId: z.string(),
});
export type AskConversationEvent = z.infer<typeof AskConversationEvent>;

export const AskErrorEvent = z.object({
  type: z.literal("error"),
  message: z.string(),
});
export type AskErrorEvent = z.infer<typeof AskErrorEvent>;

export const AskNoResultsEvent = z.object({
  type: z.literal("no_results"),
  suggestions: z.array(z.string()).default([]),
});
export type AskNoResultsEvent = z.infer<typeof AskNoResultsEvent>;

export const AskStreamEvent = z.discriminatedUnion("type", [
  AskChunkEvent,
  AskCitationEvent,
  AskConversationEvent,
  AskDoneEvent,
  AskErrorEvent,
  AskNoResultsEvent,
]);
export type AskStreamEvent = z.infer<typeof AskStreamEvent>;

export const QAMessageFeedbackRating = z.enum(["up", "down", "none"]);
export type QAMessageFeedbackRating = z.infer<typeof QAMessageFeedbackRating>;

export const QAMessageFeedback = z.object({
  rating: QAMessageFeedbackRating.default("none"),
  text: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
});
export type QAMessageFeedback = z.infer<typeof QAMessageFeedback>;

export const UpdateMessageFeedbackRequest = z.object({
  rating: QAMessageFeedbackRating,
  feedbackText: z.string().max(2000).nullable().optional(),
});
export type UpdateMessageFeedbackRequest = z.infer<typeof UpdateMessageFeedbackRequest>;

export const QAMessageDto = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  citations: z.array(Citation).default([]),
  feedback: QAMessageFeedback.default({ rating: "none", text: null, updatedAt: null }),
  createdAt: z.string(),
});
export type QAMessageDto = z.infer<typeof QAMessageDto>;

export const QAConversationDto = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messageCount: z.number().int().default(0),
});
export type QAConversationDto = z.infer<typeof QAConversationDto>;

export const QAConversationDetail = QAConversationDto.extend({
  messages: z.array(QAMessageDto),
});
export type QAConversationDetail = z.infer<typeof QAConversationDetail>;
