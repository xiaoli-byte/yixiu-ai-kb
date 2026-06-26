# ============================================================
# PostgreSQL 16 生产镜像
# 基于 pgvector/pgvector:pg16-bookworm（含 pgvector 扩展）
# 安装 zhparser（PIGSTY apt 源）
# init.sql 通过 COPY 进 /docker-entrypoint-initdb.d/ 在首次初始化时自动执行
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

# 3) 复制初始化脚本（仅在镜像构建时存在，运行时被官方 entrypoint 消费）
#    init.sql 放在 docker-entrypoint-initdb.d/ 下，postgres 首次启动时自动执行
COPY init.sql /docker-entrypoint-initdb.d/init.sql
