const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api/backend";

export class ApiError extends Error {
  status: number;
  code: string;
  retryAfter?: number;
  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

const TOKEN_KEY = "accessToken";
const REFRESH_KEY = "refreshToken";

function getStoredToken(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}

function setStoredToken(key: string, value: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, value);
}

function removeStoredToken(key: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key);
}

/** 清除所有认证信息(前端自行处理,无需调后端) */
export function clearAuth() {
  removeStoredToken(TOKEN_KEY);
  removeStoredToken(REFRESH_KEY);
}

// 单例:防止并发 401 时多次发起 refresh
let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

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

async function refreshAndRetry(): Promise<string | null> {
  if (!isRefreshing) {
    isRefreshing = true;
    const token = await doRefresh();
    isRefreshing = false;
    refreshQueue.forEach((cb) => cb(token ?? ""));
    refreshQueue = [];
    return token;
  }
  // 并发时等待刷新完成
  return new Promise<string>((resolve) => {
    refreshQueue.push((token: string) => resolve(token));
  });
}

export async function api<T = any>(
  path: string,
  init: RequestInit & { raw?: boolean; query?: Record<string, any> } = {},
): Promise<T> {
  const { raw, query, headers, ...rest } = init;
  const url = new URL(
    path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? path : "/" + path}`,
  );
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }

  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(rest.body && !(rest.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
    ...((headers as Record<string, string>) || {}),
  };

  const doFetch = async (token: string | null): Promise<Response> => {
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
    return fetch(url.toString(), { ...rest, headers: finalHeaders });
  };

  let token = getStoredToken(TOKEN_KEY);
  let res = await doFetch(token);

  // 401 → 尝试 refresh → 重试
  if (res.status === 401 && token) {
    clearAuth(); // 先清掉旧 token,避免刷新成功后旧 token 仍残留
    const newToken = await refreshAndRetry();
    if (newToken) {
      res = await doFetch(newToken);
    } else {
      clearAuth();
      if (typeof window !== "undefined") window.location.href = "/login";
      throw new ApiError(401, "TOKEN_EXPIRED", "登录已过期,请重新登录");
    }
  }

  if (raw) return res as any;
  if (!res.ok) {
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = { error: { message: await res.text() } };
    }
    
    // 429 Too Many Requests - 限流错误
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "60", 10);
      throw new ApiError(
        res.status,
        body?.error?.code || "RATE_LIMITED",
        body?.message || "请求过于频繁，请稍后再试",
        retryAfter,
      );
    }
    
    throw new ApiError(
      res.status,
      body?.error?.code || "ERROR",
      body?.error?.message || `请求失败: ${res.status}`,
    );
  }
  if (res.status === 204) return null as any;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const data = await res.json();
    return (data?.data !== undefined ? data.data : data) as T;
  }
  return (await res.text()) as any;
}

export const apiBaseUrl = API_BASE;
