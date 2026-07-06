# ============================================================
# PostgreSQL 16 生产镜像
# 基于 pgvector/pgvector:pg16-bookworm（含 pgvector 扩展）
# 安装 zhparser（PIGSTY apt 源）
# PostgreSQL 镜像只安装扩展能力；业务结构由 Prisma Migrate 回放。
# ============================================================
FROM pgvector/pgvector:pg16-bookworm

ENV DEBIAN_FRONTEND=noninteractive

# 1) 基础工具
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg && \
    rm -rf /var/lib/apt/lists/*

# 2) PIGSTY apt 源 → zhparser
RUN install -d /usr/share/keyrings && \
    curl -fsSL https://repo.pigsty.io/key \
      | gpg --dearmor -o /usr/share/keyrings/pigsty.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/pigsty.gpg] https://repo.pigsty.io/apt/pgsql/bookworm bookworm main" \
      > /etc/apt/sources.list.d/pigsty.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
      postgresql-16-zhparser && \
    rm -rf /var/lib/apt/lists/*

# 3) 不再复制完整业务 DDL 到 /docker-entrypoint-initdb.d。
#    infra/docker/postgres/init.sql 仅保留为历史参考；真实结构入口是 Prisma migrations。
