import { defineConfig } from "vitest/config";

// 按 app 拆分测试项目：apps/api 与 apps/web 的 tsconfig 各自定义了 "@" 别名
// （分别指向自己的 src）。单一全局别名只能满足其中一侧，另一侧用合法别名的
// 文件一进测试就解析失败——必须按项目分别映射。
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
    projects: [
      {
        extends: true,
        test: {
          name: "api",
          include: ["apps/api/src/**/*.spec.ts"],
        },
        resolve: {
          alias: {
            "@": new URL("./apps/api/src", import.meta.url).pathname,
          },
        },
      },
      {
        extends: true,
        test: {
          name: "web",
          include: ["apps/web/src/**/*.spec.ts"],
        },
        resolve: {
          alias: {
            "@": new URL("./apps/web/src", import.meta.url).pathname,
          },
        },
      },
    ],
  },
});
