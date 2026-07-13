import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    jsx: "react-jsx",
  },
  test: {
    environment: "node",
    globals: true,
    env: {
      // web 侧 client.ts 顶层强制要求该变量（zone 模式 404 修复后无回退值），
      // 统一注入测试值，避免测试结果依赖开发者 shell 环境
      NEXT_PUBLIC_API_URL: "/api",
    },
    include: [
      "apps/api/src/**/*.spec.ts",
      "apps/web/src/**/*.spec.ts",
    ],
  },
  resolve: {
    alias: {
      "@": new URL("./apps/web/src", import.meta.url).pathname,
    },
  },
});
