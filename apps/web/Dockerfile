FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/ packages/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile
COPY apps/web/ ./apps/web/
RUN pnpm --filter @ai-knowledge/web build

FROM node:20-alpine AS runner
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