// 重新导出新的 API 模块（保持向后兼容）
export {
  api as api,
  apiClient as apiClient,
  apiBaseUrl,
  clearAuth,
  saveAuth,
  type RequestConfig,
} from "./api/client";
export { ApiError, RateLimitError, TokenExpiredError } from "./api/errors";
