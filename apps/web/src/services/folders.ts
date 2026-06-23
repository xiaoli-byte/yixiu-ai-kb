import {
  getFolderTree as treeApi,
  createFolder as createFolderApi,
  updateFolder as updateFolderApi,
  deleteFolder as deleteFolderApi,
} from "@/lib/api/endpoints/folders";

// 类型
export type { Folder, CreateFolderData, UpdateFolderData } from "@/types/api";

// 导出 API 函数
export const tree = treeApi;
export const create = createFolderApi;
export const update = updateFolderApi;
export const remove = deleteFolderApi;

// 默认导出
const foldersApi = { tree, create, update, remove };
export default foldersApi;
