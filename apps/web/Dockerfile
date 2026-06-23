FROM node:25 AS builder
ARG NEXT_PUBLIC_API_BASE=/api
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
WORKDIR /app
RUN npm install -g pnpm@9

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
FROM node:25 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV API_INTERNAL_URL=http://api:9999
ENV PATH="/app/node_modules/.bin:/app/apps/web/node_modules/.bin:${PATH}"
RUN npm install -g pnpm@9
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/apps/web/next.config.mjs ./apps/web/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
WORKDIR /app/apps/web
EXPOSE 8888
CMD ["sh", "-c", "pnpm start"]
