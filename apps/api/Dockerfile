FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/ packages/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile
COPY apps/api/ ./apps/api/
RUN pnpm --filter @ai-knowledge/api build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages ./packages
WORKDIR /app/apps/api
EXPOSE 9999
CMD ["node", "dist/main.js"]