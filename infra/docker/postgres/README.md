# PostgreSQL 初始化策略

`init.sql` 只作为历史 baseline 参考保留，不再被 Docker 镜像复制到
`/docker-entrypoint-initdb.d/` 自动执行。

新数据库的业务结构由 `apps/api/src/database/prisma/migrations` 回放：

- 基础表结构在 `0001_initial_baseline`
- 后续结构变更继续新增 Prisma migration
- 不要在 `infra/docker/postgres` 下新增业务表、索引或约束 DDL

Docker 镜像仍负责安装 PostgreSQL 扩展依赖，例如 pgvector 和 zhparser。
