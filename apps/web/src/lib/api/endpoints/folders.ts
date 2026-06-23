import { apiClient } from "../client";
import type { Folder, CreateFolderData, UpdateFolderData } from "@/types/api";

// 获取文件夹树
export async function getFolderTree(): Promise<Folder[]> {
  return apiClient.get<Folder[]>("/folders/tree");
}

// 创建文件夹
export async function createFolder(data: CreateFolderData): Promise<Folder> {
  return apiClient.post<Folder>("/folders", data);
}

// 更新文件夹
export async function updateFolder(
  id: string,
  data: UpdateFolderData
): Promise<Folder> {
  return apiClient.patch<Folder>(`/folders/${id}`, data);
}

// 删除文件夹
export async function deleteFolder(id: string): Promise<void> {
  return apiClient.delete(`/folders/${id}`);
}
