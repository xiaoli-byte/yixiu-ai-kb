import { validateWebEnv } from "./env.mjs";

validateWebEnv();

// 微前端（Multi-Zones）：作为 ai-call 的知识库 zone 内嵌运行时设 WEB_BASE_PATH=/knowledge，
// 所有页面与 /_next 资源挂到该前缀下；不设则根路径独立部署（8888）照旧。
// 搭配 NEXT_PUBLIC_API_URL=/knowledge/api，其自身 /api rewrite 在 basePath 下自动变成
// /knowledge/api/*。详见 ai-call 仓 docs/knowledge-base-microfrontend.md。
const webBasePath = process.env.WEB_BASE_PATH?.trim() || undefined;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@ai-knowledge/schemas"],
  ...(webBasePath ? { basePath: webBasePath } : {}),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_INTERNAL_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
