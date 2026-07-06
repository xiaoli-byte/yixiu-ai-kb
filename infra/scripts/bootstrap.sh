#!/usr/bin/env bash
# 一键启动脚本：Docker 依赖 + 依赖安装 + DB 迁移 + 启动 dev
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$*"; }
err()  { printf "  \033[31m✗\033[0m %s\n" "$*"; }

bold "[1/5] 检查 .env ..."
if [ ! -f ".env" ]; then
  cp ".env.example" ".env"
  warn ".env 不存在，已从 .env.example 复制，请编辑 DASHSCOPE_API_KEY 等密钥"
fi

env_value() {
  local key="$1"
  sed -n "s/^${key}=//p" ".env" | tail -n 1
}

if [ "${POSTGRES_USER+x}" = "x" ]; then
  POSTGRES_USER_VALUE="$POSTGRES_USER"
else
  POSTGRES_USER_VALUE="$(env_value POSTGRES_USER)"
fi
if [ -z "$POSTGRES_USER_VALUE" ]; then
  err "POSTGRES_USER is required in .env"
  exit 1
fi
MINIO_PORT_VALUE="$(env_value MINIO_PORT)"
if [ -z "$MINIO_PORT_VALUE" ]; then
  MINIO_PORT_VALUE="9100"
fi

bold "[2/5] 启动 Docker 服务 (Postgres / Redis / MinIO / Neo4j) ..."
docker compose up -d

bold "[3/5] 等待依赖就绪 ..."
# Postgres
for i in {1..30}; do
  if docker exec ai-knowledge-postgres pg_isready -U "$POSTGRES_USER_VALUE" >/dev/null 2>&1; then
    ok "Postgres 就绪"; break
  fi
  sleep 1
  [ "$i" -eq 30 ] && { err "Postgres 启动超时"; exit 1; }
done
# Neo4j
for i in {1..60}; do
  if curl -sf http://localhost:7474 >/dev/null 2>&1; then
    ok "Neo4j 就绪"; break
  fi
  sleep 1
  [ "$i" -eq 60 ] && { warn "Neo4j 仍在启动，继续后续步骤"; break; }
done
# Redis
for i in {1..20}; do
  if docker exec ai-knowledge-redis redis-cli ping 2>/dev/null | grep -q PONG; then
    ok "Redis 就绪"; break
  fi
  sleep 1
  [ "$i" -eq 20 ] && { warn "Redis 未就绪"; }
done
# MinIO
for i in {1..30}; do
  if curl -sf "http://localhost:${MINIO_PORT_VALUE}/minio/health/live" >/dev/null 2>&1; then
    ok "MinIO 就绪"; break
  fi
  sleep 1
  [ "$i" -eq 30 ] && { warn "MinIO 未就绪"; }
done

bold "[4/5] 安装依赖 ..."
if command -v pnpm >/dev/null 2>&1; then
  pnpm install
else
  err "未检测到 pnpm，请先安装：npm i -g pnpm@9"
  exit 1
fi

bold "[5/5] 初始化 Prisma schema + Neo4j schema ..."
pnpm --filter @ai-knowledge/api prisma:generate
pnpm --filter @ai-knowledge/api prisma:migrate:deploy || warn "Prisma migrate deploy 失败，请稍后重试"
pnpm graph:migrate || warn "Neo4j graph migrate 失败，请确认 Neo4j 就绪后重试"

ok "启动完成！下一步："
echo "  pnpm seed           # 写入演示数据（admin@demo.com / demo123）"
echo "  pnpm dev            # 启动 API (9999) + Web (8888)"
echo "  docker compose logs -f   # 查看服务日志"
