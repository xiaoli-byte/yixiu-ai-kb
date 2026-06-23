import "server-only";
import { cookies } from "next/headers";
import { ApiError } from "./errors";

// 服务端使用的内部 API 地址
const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL || "http://api:9999/api";

// 请求配置类型
export interface ServerFetchOptions {
  revalidate?: number | false;
  tags?: string[];
}

// 基础 fetch 函数（服务端使用）
async function serverFetch<T>(
  url: string,
  init?: RequestInit & { next?: { revalidate?: number | false; tags?: string[] } }
): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init?.headers as Record<string, string>) || {}),
  };

  const fullUrl = url.startsWith("http") ? url : `${INTERNAL_API_URL}${url}`;

  const response = await fetch(fullUrl, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = { message: await response.text() };
    }
    const errBody = body as { message?: string; code?: string } | undefined;
    throw new ApiError(
      response.status,
      errBody?.message || `服务端请求失败 (${response.status})`,
      errBody?.code
    );
  }

  if (response.status === 204) return undefined as unknown as T;

  const ct = response.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const data = await response.json();
    return (data?.data !== undefined ? data.data : data) as T;
  }

  return (await response.text()) as unknown as T;
}

// 构建带查询参数的 URL
function buildUrl(path: string, query?: Record<string, unknown>): string {
  let url = path.startsWith("http") ? path : path.startsWith("/") ? path : "/" + path;

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

// 服务端 API 实例
export const serverApi = {
  get: <T>(
    url: string,
    options?: ServerFetchOptions & { query?: Record<string, unknown> }
  ) =>
    serverFetch<T>(buildUrl(url, options?.query), {
      method: "GET",
    }),

  post: <T>(
    url: string,
    body?: unknown,
    options?: ServerFetchOptions & { query?: Record<string, unknown> }
  ) =>
    serverFetch<T>(buildUrl(url, options?.query), {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(
    url: string,
    body?: unknown,
    options?: ServerFetchOptions & { query?: Record<string, unknown> }
  ) =>
    serverFetch<T>(buildUrl(url, options?.query), {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(
    url: string,
    body?: unknown,
    options?: ServerFetchOptions & { query?: Record<string, unknown> }
  ) =>
    serverFetch<T>(buildUrl(url, options?.query), {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(
    url: string,
    options?: ServerFetchOptions & { query?: Record<string, unknown> }
  ) =>
    serverFetch<T>(buildUrl(url, options?.query), {
      method: "DELETE",
    }),
};
