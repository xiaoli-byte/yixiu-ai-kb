import {
  addDocumentTag as addTagApi,
  batchDocuments as batchDocumentsApi,
  deleteDocument as deleteDocApi,
  getDocument as getDocApi,
  getDocumentPermissions as getPermissionsApi,
  getDocuments as getDocsApi,
  removeDocumentTag as removeTagApi,
  retryDocumentParse as retryDocumentParseApi,
  retryParse as retryParseApi,
  setBatchDocumentPermissions as setBatchDocumentPermissionsApi,
  setBatchPermissions as setBatchPermissionsApi,
  setDocumentPermissions as setPermissionsApi,
  updateDocument as updateDocApi,
  uploadDocument as uploadDocApi,
  uploadDocuments as uploadDocsApi,
} from "@/lib/api/endpoints/documents";

export type {
  DocumentBatchAction,
  DocumentBatchOperationRequest,
  DocumentBatchOperationResponse,
  DocumentBatchOperationResult,
  DocumentBatchPermissionUpdateRequest,
  DocumentBatchUploadResponse,
  DocumentBatchUploadResult,
  DocumentDetail,
  DocumentDto,
  DocumentListQuery,
  DocumentListResponse,
  DocumentParseRetryResponse,
  DocumentPermissionEntry,
  DocumentPermissionResponse,
  DocumentPermissionScope,
  DocumentPermissionUpdateRequest,
  DocumentQuery,
  DocumentStatus,
  DocumentTag,
  DocumentUpdateData,
  PermissionMode,
  PermissionSubjectType,
} from "@/types/api";

export const list = getDocsApi;
export const get = getDocApi;
export const getPermissions = getPermissionsApi;
export const setPermissions = setPermissionsApi;
export const setBatchDocumentPermissions = setBatchDocumentPermissionsApi;
export const setBatchPermissions = setBatchPermissionsApi;
export const batchDocuments = batchDocumentsApi;
export const retryDocumentParse = retryDocumentParseApi;
export const retryParse = retryParseApi;
export const update = updateDocApi;
export const remove = deleteDocApi;
export const upload = uploadDocApi;
export const uploadBatch = uploadDocsApi;
export const addTag = addTagApi;
export const removeTag = removeTagApi;

const documentsApi = {
  list,
  get,
  getPermissions,
  setPermissions,
  setBatchDocumentPermissions,
  setBatchPermissions,
  batchDocuments,
  retryDocumentParse,
  retryParse,
  update,
  remove,
  upload,
  uploadBatch,
  addTag,
  removeTag,
};

export default documentsApi;
