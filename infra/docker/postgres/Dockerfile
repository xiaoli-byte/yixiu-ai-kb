# ============================================================
# PostgreSQL 16 生产镜像
# 基于 pgvector/pgvector:pg16-bookworm（含 pgvector 扩展）
# 安装 zhparser（PIGSTY apt 源）
# init.sql 作为历史基线在首次初始化时自动执行；后续业务结构变更必须使用 Prisma Migrate
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

# 3) 复制历史基线初始化脚本（运行时被官方 entrypoint 消费）
#    不要把新的业务表结构变更继续写入 init.sql；请更新 Prisma schema 并生成 Prisma migration。
COPY init.sql /docker-entrypoint-initdb.d/init.sql
