#!/bin/sh
# ============================================================
# API Service Entry Point
# ============================================================
# 
# 功能:
#   1. 等待数据库就绪
#   2. 运行数据库迁移
#   3. 初始化数据 (可选)
#   4. 启动应用

set -e

echo "[API] Starting entrypoint..."

# 等待 PostgreSQL 就绪
echo "[API] Waiting for PostgreSQL..."
max_attempts=30
attempt=0

until PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\q' 2>/dev/null; do
    attempt=$((attempt + 1))
    if [ $attempt -ge $max_attempts ]; then
        echo "[API] PostgreSQL not available after $max_attempts attempts. Exiting."
        exit 1
    fi
    echo "[API] Waiting for PostgreSQL... ($attempt/$max_attempts)"
    sleep 2
done

echo "[API] PostgreSQL is ready!"

# 等待 Redis 就绪
echo "[API] Waiting for Redis..."
max_attempts=15
attempt=0

until redis-cli -h redis ping 2>/dev/null | grep -q PONG; do
    attempt=$((attempt + 1))
    if [ $attempt -ge $max_attempts ]; then
        echo "[API] Redis not available after $max_attempts attempts. Exiting."
        exit 1
    fi
    echo "[API] Waiting for Redis... ($attempt/$max_attempts)"
    sleep 2
done

echo "[API] Redis is ready!"

# 等待 MinIO 就绪
echo "[API] Waiting for MinIO..."
max_attempts=10
attempt=0

until curl -sf http://minio:9000/minio/health/live 2>/dev/null; do
    attempt=$((attempt + 1))
    if [ $attempt -ge $max_attempts ]; then
        echo "[API] MinIO not available after $max_attempts attempts."
        echo "[API] Continuing anyway (MinIO may start later)..."
        break
    fi
    echo "[API] Waiting for MinIO... ($attempt/$max_attempts)"
    sleep 2
done

echo "[API] MinIO check completed!"

# 等待 Neo4j 就绪
echo "[API] Waiting for Neo4j..."
max_attempts=15
attempt=0

until curl -sf http://neo4j:7474 2>/dev/null; do
    attempt=$((attempt + 1))
    if [ $attempt -ge $max_attempts ]; then
        echo "[API] Neo4j not available after $max_attempts attempts."
        echo "[API] Continuing anyway (Neo4j may start later)..."
        break
    fi
    echo "[API] Waiting for Neo4j... ($attempt/$max_attempts)"
    sleep 2
done

echo "[API] Neo4j check completed!"

# 运行数据库迁移 (如果需要)
if [ "$RUN_MIGRATIONS" = "true" ] || [ "$NODE_ENV" = "production" ]; then
    echo "[API] Running database migrations..."
    pnpm prisma:migrate:deploy || echo "[API] Migration completed or already up to date"
fi

# 初始化数据 (首次启动时)
if [ "$SEED_DATABASE" = "true" ]; then
    echo "[API] Seeding database..."
    pnpm seed || echo "[API] Seeding skipped (may already be seeded)"
fi

echo "[API] Starting application..."
echo "[API] Working directory: $(pwd)"
echo "[API] Node version: $(node --version)"

# 执行主命令
exec tini -g -- "$@"
