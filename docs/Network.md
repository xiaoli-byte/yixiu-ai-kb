在 Next.js 项目中，网络请求架构需要同时兼顾服务端渲染（SSR/SSG）、客户端交互（CSR）以及开发代理等多层场景。合理的设计应该解决跨域、统一错误处理、类型安全、缓存策略和代码复用等问题。下面给出一个完整、可落地的方案。

1. 网络请求代理
1.1 开发环境代理（解决跨域）
在 next.config.js 中使用 rewrites 将前端请求转发到真实后端，避免浏览器跨域限制，同时保证 Cookie 等凭证正常携带。

javascript
// next.config.js
module.exports = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',          // 前端请求路径
        destination: 'http://localhost:8080/api/:path*' // 真实后端地址
      }
    ];
  }
};
优势：开发时前端直接 fetch('/api/xxx')，就像请求同源服务。

生产环境：若部署在 Vercel，可在 vercel.json 配置相同 rewrite；若自托管（如 Docker + Nginx），则由网关层反向代理处理。

1.2 BFF 代理（后端转发）
当需要隐藏后端内部接口、聚合数据或添加额外鉴权时，可以用 Next.js API Routes / Route Handlers 做一层中间层。

typescript
// app/api/bff/user/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const backendRes = await fetch('http://internal-backend:8080/api/user', {
    headers: {
      Authorization: req.headers.get('Authorization') || ''
    }
  });
  const data = await backendRes.json();
  return NextResponse.json(data);
}
这样客户端请求 /api/bff/user，实际由服务端转发，既能保护内部地址，又能在转发前做权限校验。

2. 统一请求架构设计
2.1 核心原则
环境隔离：服务端与客户端请求实例分开，避免 window/process 混用。

基础实例封装：统一处理 baseURL、超时、请求头、响应拦截、错误转换。

类型驱动：所有接口严格定义请求参数与响应结构，配合 TypeScript 保证类型安全。

业务分离：按模块拆分 API 函数（endpoints），再通过 hooks 或 service 层提供给组件。

2.2 推荐目录结构
text
src/
├── lib/
│   ├── api/
│   │   ├── client.ts          # 客户端请求实例
│   │   ├── server.ts          # 服务端请求实例
│   │   ├── errors.ts          # 自定义异常
│   │   └── endpoints/         # 业务 API 函数
│   │       ├── auth.ts
│   │       └── user.ts
├── types/
│   └── api/                   # 接口类型定义
│       ├── auth.ts
│       └── user.ts
└── hooks/
    └── useUser.ts             # 组合业务逻辑与缓存（SWR/React Query）
3. 实战示例
3.1 自定义异常类
typescript
// lib/api/errors.ts
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
3.2 客户端请求实例（浏览器端）
基于原生 fetch 封装，可替换为 axios。

typescript
// lib/api/client.ts
import { ApiError } from './errors';

type RequestConfig = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

// 从 cookie/localStorage 获取 token（按实际方案调整）
function getClientToken() {
  if (typeof document === 'undefined') return '';
  // 示例：从 cookie 读取
  return document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1] ?? '';
}

async function clientFetch<T>(url: string, config: RequestConfig = {}): Promise<T> {
  const { method = 'GET', body, headers, signal } = config;

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  const token = getClientToken();
  if (token) {
    finalHeaders['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      errorBody.message || `请求失败 (${response.status})`,
      errorBody
    );
  }

  // 如果状态码 204 无内容
  if (response.status === 204) return undefined as unknown as T;
  return response.json();
}

export const apiClient = {
  get: <T>(url: string, config?: Omit<RequestConfig, 'method' | 'body'>) =>
    clientFetch<T>(url, { ...config, method: 'GET' }),
  post: <T>(url: string, body?: unknown, config?: Omit<RequestConfig, 'method' | 'body'>) =>
    clientFetch<T>(url, { ...config, method: 'POST', body }),
  put: <T>(url: string, body?: unknown, config?: Omit<RequestConfig, 'method' | 'body'>) =>
    clientFetch<T>(url, { ...config, method: 'PUT', body }),
  delete: <T>(url: string, config?: Omit<RequestConfig, 'method' | 'body'>) =>
    clientFetch<T>(url, { ...config, method: 'DELETE' }),
};
客户端请求使用相对路径 /api/xxx 即可走 Next.js 的 rewrites 代理。

3.3 服务端请求实例（Node.js 运行时）
用于 Server Components、getServerSideProps 或 Route Handlers。

typescript
// lib/api/server.ts
import { cookies } from 'next/headers';
import { ApiError } from './errors';

type ServerFetchOptions = {
  revalidate?: number | false;  // ISR 重新验证时间（秒）
  tags?: string[];              // 按需重新验证标签
};

async function serverFetch<T>(
  url: string,
  init?: RequestInit & { next?: { revalidate?: number | false; tags?: string[] } }
): Promise<T> {
  // 服务端直接使用完整后端地址（或内部地址）
  const BASE_URL = process.env.API_INTERNAL_URL || 'http://localhost:8080/api';
  const cookieStore = cookies();
  const token = cookieStore.get('token')?.value;

  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...init?.headers,
  };

  const response = await fetch(`${BASE_URL}${url}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      errorBody.message || `服务端请求失败 (${response.status})`
    );
  }

  return response.json();
}

export const serverApi = {
  get: <T>(url: string, options?: ServerFetchOptions) =>
    serverFetch<T>(url, { method: 'GET', next: { revalidate: options?.revalidate, tags: options?.tags } }),
  post: <T>(url: string, body?: unknown) =>
    serverFetch<T>(url, { method: 'POST', body: JSON.stringify(body) }),
  // ...put, delete 类似
};
通过 cookies() 读取 token，保证 SSR 时安全携带。

利用 Next.js 扩展的 fetch 支持 next.revalidate 和 tags 实现 ISR 缓存控制。

3.4 类型定义示例
typescript
// types/api/user.ts
export interface UserProfile {
  id: string;
  name: string;
  email: string;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
}
3.5 业务 API 函数（Endpoints）
将基础实例与类型结合，导出纯净的函数。

typescript
// lib/api/endpoints/user.ts
import { apiClient } from '../client';        // 客户端实例
import { serverApi } from '../server';        // 服务端实例
import type { UserProfile, UpdateUserRequest } from '@/types/api/user';

// 客户端使用
export const getUserProfile = () =>
  apiClient.get<UserProfile>('/api/user/profile');

export const updateUserProfile = (data: UpdateUserRequest) =>
  apiClient.put<UserProfile>('/api/user/profile', data);

// 服务端使用（可用于 Server Component 直接获取数据）
export const getUserProfileServer = (revalidate = 60) =>
  serverApi.get<UserProfile>('/api/user/profile', { revalidate });
建议用 server-only 和 client-only 包标记文件，防止在错误环境引用。例如 server.ts 头部添加 import 'server-only';。

3.6 客户端数据获取 Hooks（以 SWR 为例）
typescript
// hooks/useUser.ts
import useSWR from 'swr';
import { getUserProfile } from '@/lib/api/endpoints/user';

export function useUser() {
  const { data, error, isLoading, mutate } = useSWR('/api/user/profile', getUserProfile, {
    revalidateOnFocus: false,
  });

  return {
    user: data,
    isLoading,
    isError: !!error,
    mutate,   // 用于乐观更新或重新验证
  };
}
4. 最佳实践总结
4.1 环境区分
客户端实例用相对路径（/api/...）依赖 Next.js rewrites。

服务端实例用绝对内部地址，避免走公网绕路，且 cookies() 只能在服务端读取。

4.2 错误处理全局化
在基础请求函数中统一捕获异常并转换为 ApiError，上层组件/页面可以用 ErrorBoundary 或 toast 集中展示。

4.3 请求去重与缓存
服务端：利用 next.revalidate 和 tags + revalidateTag 实现 ISR。

客户端：推荐使用 SWR 或 TanStack React Query，它们自带请求去重、缓存、自动重试和乐观更新。

4.4 接口类型安全
所有 API 函数的入参和返回值必须定义泛型 T，配合 zod 在边界验证数据（可在基础 fetch 后调用 zodSchema.parse(data)），避免运行时类型隐患。

4.5 跨请求认证
客户端：token 存放在 httpOnly cookie（最安全）或 localStorage，由基础实例自动注入 Authorization 头。

服务端：通过 cookies() 获取 token 并透传。

刷新 token 逻辑可放在基础实例的拦截器中，当收到 401 时尝试无感刷新，并重放请求。

4.6 取消重复请求
在客户端快速切换页面时，使用 AbortController 配合 useEffect 清理函数取消未完成的 fetch，避免内存泄漏或状态异常。

总结
一个合理的 Next.js 网络请求架构包含：

代理层：next.config.js rewrites 用于开发跨域，BFF 路由用于生产安全转发。

双实例封装：分离 client.ts 与 server.ts，分别处理浏览器与 Node.js 环境的差异。

统一 API 文件：按照业务模块编写 endpoints，所有函数强制类型约束。

状态管理：客户端集成 SWR/React Query 管理缓存与请求时序。

这样既保证了代码的整洁与复用，又能充分利用 Next.js 的渲染特性，让数据获取更安全、更高效。

