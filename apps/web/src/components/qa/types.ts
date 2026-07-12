// QA 页面组件共用的本地类型定义
// 复用 @/types/api 中的服务端契约类型，仅在展示层做少量扩展
import type { Citation, MessageFeedback, MessageFeedbackRating } from "@/types/api";

export type { Citation, MessageFeedback, MessageFeedbackRating };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  /** 新建但尚未收到反馈状态的消息可能没有该字段 */
  feedback?: MessageFeedback;
  createdAt: string;
  /** 该消息是否为用户点击“停止”后保留的部分内容（仅本地展示，不代表与后端状态一致） */
  stopped?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}
