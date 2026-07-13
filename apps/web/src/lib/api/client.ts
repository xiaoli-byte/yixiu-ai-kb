import { ApiError, RateLimitError, TokenExpiredError } from "./errors";
import { useAuth, COOKIE_SESSION } from "../store";

// zone 模式（basePath=/knowledge，构建期内联）下本地登录页在 /knowledge/login；
// 独立部署为空串，/login 即本地登录页。
const WEB_BASE_PATH = process.env.NEXT_PUBLIC_WEB_BASE_PATH || "";

// cookie 会话（无状态联合登录）失效时的去向：ai-call 登录页（域名根 /login，带回跳）。
// window.location 不经过 basePath，所以 "/login" 在 zone 模式下就是 ai-call 的登录页；
// 本地 /knowledge/login 对联合身份用户无法登录（占位密码）。
function redirectToFederatedLogin() {
  if (typeof window === "undefined") return;
  const backTo = window.location.pathname + window.location.search;
  window.location.href = `/login?redirect=${encodeURIComponent(backTo)}`;
}

// Token 存储键
const TOKEN_KEY = "accessToken";
const REFRESH_KEY = "refreshToken";

// 获取 token
function getStoredToken(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}

// 设置 token
function setStoredToken(key: string, value: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, value);
}

// 清除 token
function removeStoredToken(key: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key);
}

// 清除所有认证信息
export function clearAuth() {
  removeStoredToken(TOKEN_KEY);
  removeStoredToken(REFRESH_KEY);
}

// 保存认证信息
export function saveAuth(accessToken: string, refreshToken: string) {
  setStoredToken(TOKEN_KEY, accessToken);
  setStoredToken(REFRESH_KEY, refreshToken);
}

// 单例：防止并发 401 时多次发起 refresh
let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

// 执行 refresh
async function doRefresh(): Promise<string | null> {
  const refreshToken = getStoredToken(REFRESH_KEY);
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const newToken: string = data?.accessToken;
    if (!newToken) return null;
    setStoredToken(TOKEN_KEY, newToken);
    return newToken;
  } catch {
    return null;
  }
}

// 刷新并重试
async function refreshAndRetry(): Promise<string | null> {
  if (!isRefreshing) {
    isRefreshing = true;
    const token = await doRefresh();
    isRefreshing = false;
    refreshQueue.forEach((cb) => cb(token ?? ""));
    refreshQueue = [];
    return token;
  }
  return new Promise<string>((resolve) => {
    refreshQueue.push((token: string) => resolve(token));
  });
}

// 请求配置类型
export interface RequestConfig {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  signal?: AbortSignal;
}

// 基础 fetch 函数
async function clientFetch<T>(
  url: string,
  config: RequestConfig = {}
): Promise<T> {
  const { method = "GET", body, headers, signal } = config;

  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(body && !(body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    ...headers,
  };

  const token = getStoredToken(TOKEN_KEY);
  if (token) {
    finalHeaders["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method,
    headers: finalHeaders,
    // 微前端同域内嵌时带上 ai-call 的共享 cookie，实现无状态联合登录（无 Bearer 也能认证）。
    // 独立部署无该 cookie 时无害，仍走上面的 Authorization: Bearer。
    credentials: "include",
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    signal,
  });

  if (response.status === 401) {
    if (token) {
      clearAuth();
      const newToken = await refreshAndRetry();
      if (newToken) {
        finalHeaders["Authorization"] = `Bearer ${newToken}`;
        const retryRes = await fetch(url, {
          method,
          headers: finalHeaders,
          credentials: "include",
          body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
          signal,
        });
        return handleResponse<T>(retryRes);
      }
      if (typeof window !== "undefined") {
        // Bearer 流的本地登录页要带上 basePath（zone 模式下是 /knowledge/login）。
        window.location.href = `${WEB_BASE_PATH}/login`;
      }
      throw new TokenExpiredError();
    }
    // cookie 会话（无状态联合登录）过期/失效：本地没有 refresh token 可刷（真正的凭证
    // 是 ai-call 的 httpOnly cookie），清内存态后整页跳 ai-call 登录页重新联合登录。
    // 不处理的话这里会一路抛 ApiError，用户只看到报错且无法自愈（原 #2 死路）。
    if (useAuth.getState().accessToken === COOKIE_SESSION) {
      useAuth.getState().logout();
      redirectToFederatedLogin();
      throw new TokenExpiredError();
    }
  }

  return handleResponse<T>(response);
}

// Binary document responses use the same authentication and refresh semantics
// as JSON API calls. Opening a protected API URL directly in a new window would
// lose a Bearer token stored by the SPA, so file consumers should use this path
// and open the returned Blob URL instead.
async function clientFetchBlob(
  url: string,
  config: Omit<RequestConfig, "body"> = {},
): Promise<Blob> {
  const { method = "GET", headers, signal } = config;
  const finalHeaders: Record<string, string> = {
    Accept: "*/*",
    ...headers,
  };

  const token = getStoredToken(TOKEN_KEY);
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  let response = await fetch(url, {
    method,
    headers: finalHeaders,
    credentials: "include",
    signal,
  });

  if (response.status === 401) {
    if (token) {
      const newToken = await refreshAndRetry();
      if (newToken) {
        finalHeaders.Authorization = `Bearer ${newToken}`;
        response = await fetch(url, {
          method,
          headers: finalHeaders,
          credentials: "include",
          signal,
        });
      } else {
        clearAuth();
        if (typeof window !== "undefined") window.location.href = `${WEB_BASE_PATH}/login`;
        throw new TokenExpiredError();
      }
    } else if (useAuth.getState().accessToken === COOKIE_SESSION) {
      useAuth.getState().logout();
      redirectToFederatedLogin();
      throw new TokenExpiredError();
    }
  }

  if (!response.ok) {
    await handleResponse<never>(response);
    throw new ApiError(response.status, `请求失败 (${response.status})`);
  }
  return response.blob();
}

// 处理响应
async function handleResponse<T>(response: Response): Promise<T> {
  // 429 Too Many Requests
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get("Retry-After") || "60", 10);
    let body: any = null;
    try {
      body = await response.json();
    } catch {}
    throw new RateLimitError(
      body?.message || "请求过于频繁，请稍后再试",
      retryAfter
    );
  }

  if (!response.ok) {
    let body: any = null;
    try {
      body = await response.json();
    } catch {
      body = { message: await response.text() };
    }
    throw new ApiError(
      response.status,
      body?.message || body?.error?.message || `请求失败 (${response.status})`,
      body?.code || body?.error?.code,
      undefined,
      body
    );
  }

  // 204 No Content
  if (response.status === 204) return undefined as unknown as T;

  const ct = response.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const data = await response.json();
    return (data?.data !== undefined ? data.data : data) as T;
  }

  return (await response.text()) as unknown as T;
}

// API 基础路径
// 生产环境通过 nginx 反代走相对路径 /api
// 开发环境使用绝对 URL 直连 API，避免 Next.js 代理的文件大小限制
const API_BASE = process.env.NEXT_PUBLIC_API_URL;
if (!API_BASE) {
  throw new Error("Missing required public environment variable: NEXT_PUBLIC_API_URL");
}

// 构建带查询参数的 URL
function buildUrl(path: string, query?: Record<string, unknown>): string {
  const basePath = path.startsWith("http") ? "" : API_BASE;
  let url = `${basePath}${path.startsWith("/") ? path : "/" + path}`;

  if (query) {
    const searchParams = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        searchParams.set(k, String(v));
      }
    });
    const qs = searchParams.toString();
    if (qs) {
      url += (url.includes("?") ? "&" : "?") + qs;
    }
  }

  return url;
}

// API 客户端
export const apiClient = {
  get: <T>(url: string, config?: Omit<RequestConfig, "method" | "body">) =>
    clientFetch<T>(buildUrl(url, config?.query), { ...config, method: "GET" }),

  post: <T>(
    url: string,
    body?: unknown,
    config?: Omit<RequestConfig, "method" | "body">
  ) =>
    clientFetch<T>(buildUrl(url, config?.query), { ...config, method: "POST", body }),

  put: <T>(
    url: string,
    body?: unknown,
    config?: Omit<RequestConfig, "method" | "body">
  ) =>
    clientFetch<T>(buildUrl(url, config?.query), { ...config, method: "PUT", body }),

  patch: <T>(
    url: string,
    body?: unknown,
    config?: Omit<RequestConfig, "method" | "body">
  ) =>
    clientFetch<T>(buildUrl(url, config?.query), { ...config, method: "PATCH", body }),

  delete: <T>(url: string, config?: Omit<RequestConfig, "method" | "body">) =>
    clientFetch<T>(buildUrl(url, config?.query), { ...config, method: "DELETE" }),

  getBlob: (url: string, config?: Omit<RequestConfig, "method" | "body">) =>
    clientFetchBlob(buildUrl(url, config?.query), { ...config, method: "GET" }),
};

// 兼容旧 API - 导出统一的 api 函数
export const api = apiClient;

// 导出 base URL：必须与 apiClient 同源（NEXT_PUBLIC_API_URL），
// zone 模式下为 /knowledge/api，硬编码 "/api" 会 404
export const apiBaseUrl = API_BASE;
