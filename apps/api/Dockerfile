FROM node:25 AS builder
WORKDIR /app
RUN npm install -g pnpm@9
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/ packages/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --shamefully-hoist

# 构建共享包
RUN pnpm --filter @ai-knowledge/schemas build

COPY apps/api/ ./apps/api/
RUN pnpm --filter @ai-knowledge/api prisma:generate
RUN pnpm --filter @ai-knowledge/api build

FROM node:25 AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g pnpm@9
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages ./packages
WORKDIR /app/apps/api
EXPOSE 9999
CMD ["node", "dist/main.js"]
