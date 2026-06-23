import useSWR, { SWRConfiguration } from "swr";
import {
  getConversations,
  getConversation,
  deleteConversation,
} from "@/lib/api/endpoints/qa";
import type { Conversation, ConversationDetail } from "@/types/api";

// 获取会话列表
export function useConversations(config?: SWRConfiguration<Conversation[]>) {
  return useSWR<Conversation[]>("/qa/conversations", () => getConversations(), {
    revalidateOnFocus: false,
    ...config,
  });
}

// 获取会话详情
export function useConversation(
  id: string | null,
  config?: SWRConfiguration<ConversationDetail>
) {
  return useSWR<ConversationDetail>(
    id ? `/qa/conversations/${id}` : null,
    () => getConversation(id!),
    {
      revalidateOnFocus: false,
      ...config,
    }
  );
}

// 导出操作函数
export const conversationActions = {
  remove: deleteConversation,
};
