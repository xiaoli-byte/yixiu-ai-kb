import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
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
