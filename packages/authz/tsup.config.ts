import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "core/index": "src/core/index.ts",
    "jwt/index": "src/jwt/index.ts",
    "acl/index": "src/acl/index.ts",
    "nestjs/index": "src/nestjs/index.ts",
    "prisma/index": "src/prisma/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  external: ["@nestjs/common", "@nestjs/core", "nestjs-cls", "express"],
});
