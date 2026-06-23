import {
  getDocuments as getDocsApi,
  getDocument as getDocApi,
  updateDocument as updateDocApi,
  deleteDocument as deleteDocApi,
  uploadDocument as uploadDocApi,
  addDocumentTag as addTagApi,
  removeDocumentTag as removeTagApi,
} from "@/lib/api/endpoints/documents";

// 类型
export type {
  DocumentDto,
  DocumentDetail,
  DocumentListResponse,
  DocumentQuery,
  DocumentUpdateData,
  DocumentTag,
} from "@/types/api";

// 导出 API 函数
export const list = getDocsApi;
export const get = getDocApi;
export const update = updateDocApi;
export const remove = deleteDocApi;
export const upload = uploadDocApi;
export const addTag = addTagApi;
export const removeTag = removeTagApi;

// 默认导出
const documentsApi = { list, get, update, remove, upload, addTag, removeTag };
export default documentsApi;
