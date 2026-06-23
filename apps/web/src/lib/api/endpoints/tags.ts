import { apiClient } from "../client";
import type { Tag, CreateTagData } from "@/types/api";

// 获取标签列表
export async function getTags(): Promise<Tag[]> {
  return apiClient.get<Tag[]>("/tags");
}

// 获取标签统计
export async function getTagsStats(): Promise<Tag[]> {
  return apiClient.get<Tag[]>("/tags/stats");
}

// 创建标签
export async function createTag(data: CreateTagData): Promise<Tag> {
  return apiClient.post<Tag>("/tags", data);
}

// 更新标签
export async function updateTag(id: string, name: string): Promise<Tag> {
  return apiClient.patch<Tag>(`/tags/${id}`, { name });
}

// 删除标签
export async function deleteTag(id: string): Promise<void> {
  return apiClient.delete(`/tags/${id}`);
}
