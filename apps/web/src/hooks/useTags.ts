import useSWR, { SWRConfiguration } from "swr";
import { getTags, getTagsStats, createTag, updateTag, deleteTag } from "@/lib/api/endpoints/tags";
import type { Tag, CreateTagData } from "@/types/api";

// 获取标签列表
export function useTags(config?: SWRConfiguration<Tag[]>) {
  return useSWR<Tag[]>("/tags", () => getTags(), {
    revalidateOnFocus: false,
    ...config,
  });
}

// 获取标签统计
export function useTagsStats(config?: SWRConfiguration<Tag[]>) {
  return useSWR<Tag[]>("/tags/stats", () => getTagsStats(), {
    revalidateOnFocus: false,
    ...config,
  });
}

// 导出操作函数
export const tagActions = {
  create: createTag,
  update: updateTag,
  remove: deleteTag,
};
