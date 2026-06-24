FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++ curl openssl && npm install -g pnpm@9

COPY package.json pnpm-workspace.yaml turbo.json ./
COPY .npmrc ./
COPY packages/ packages/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --shamefully-hoist

# 构建共享包
RUN pnpm --filter @ai-knowledge/schemas build

COPY apps/api/ ./apps/api/
RUN pnpm --filter @ai-knowledge/api prisma:generate
RUN pnpm --filter @ai-knowledge/api build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl curl tini && npm install -g pnpm@9
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/src/database/prisma ./apps/api/src/database/prisma
COPY --from=builder /app/packages ./packages
WORKDIR /app/apps/api
EXPOSE 9999
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]