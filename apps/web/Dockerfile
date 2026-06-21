FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable

# 复制 workspace 配置（包括 .npmrc）
COPY .npmrc ./
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/ packages/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# 安装依赖
RUN pnpm install --shamefully-hoist

# 复制源代码
COPY apps/ ./apps/

# 在 web 目录内重新安装并构建
WORKDIR /app/apps/web
RUN pnpm install --shamefully-hoist && pnpm build

# 运行阶段
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/apps/web/next.config.mjs ./apps/web/
COPY --from=builder /app/node_modules ./node_modules
WORKDIR /app/apps/web
EXPOSE 8888
CMD ["pnpm", "start"]
