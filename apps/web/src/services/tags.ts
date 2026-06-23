import {
  getTags as getTagsApi,
  getTagsStats as statsApi,
  createTag as createTagApi,
  updateTag as updateTagApi,
  deleteTag as deleteTagApi,
} from "@/lib/api/endpoints/tags";

// 类型
export type { Tag, CreateTagData } from "@/types/api";

// 导出 API 函数
export const list = getTagsApi;
export const stats = statsApi;
export const create = createTagApi;
export const update = updateTagApi;
export const remove = deleteTagApi;

// 默认导出
const tagsApi = { list, stats, create, update, remove };
export default tagsApi;
