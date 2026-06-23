import useSWR, { SWRConfiguration } from "swr";
import {
  getDocuments,
  getDocument,
  updateDocument,
  deleteDocument,
  uploadDocument,
  addDocumentTag,
  removeDocumentTag,
} from "@/lib/api/endpoints/documents";
import type {
  DocumentDto,
  DocumentDetail,
  DocumentListResponse,
  DocumentQuery,
  DocumentUpdateData,
} from "@/types/api";

// 获取文档列表
export function useDocuments(
  query?: DocumentQuery,
  config?: SWRConfiguration<DocumentListResponse>
) {
  const key = query ? ["/documents", query] : "/documents";
  return useSWR<DocumentListResponse>(key, () => getDocuments(query), {
    revalidateOnFocus: false,
    ...config,
  });
}

// 获取文档详情
export function useDocument(
  id: string | null,
  config?: SWRConfiguration<DocumentDetail>
) {
  return useSWR<DocumentDetail>(
    id ? `/documents/${id}` : null,
    () => getDocument(id!),
    {
      revalidateOnFocus: false,
      ...config,
    }
  );
}

// 导出操作函数供直接调用
export const documentActions = {
  update: updateDocument,
  remove: deleteDocument,
  upload: uploadDocument,
  addTag: addDocumentTag,
  removeTag: removeDocumentTag,
};
