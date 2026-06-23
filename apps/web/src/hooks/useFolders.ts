import useSWR, { SWRConfiguration } from "swr";
import { getFolderTree, createFolder, updateFolder, deleteFolder } from "@/lib/api/endpoints/folders";
import type { Folder, CreateFolderData, UpdateFolderData } from "@/types/api";

// 获取文件夹树
export function useFolderTree(config?: SWRConfiguration<Folder[]>) {
  return useSWR<Folder[]>("/folders/tree", () => getFolderTree(), {
    revalidateOnFocus: false,
    ...config,
  });
}

// 导出操作函数
export const folderActions = {
  create: createFolder,
  update: updateFolder,
  remove: deleteFolder,
};
