# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important
请用中文回答和撰写文档、代码注释

## Orchestration workflow  
You (Fable/Opus) are the orchestrator. Delegate independent subtasks to subagents and keep working while they run. Intervene
if a subagent goes off track or is missing relevant context.

Plan, decompose, synthesize.  
Reasoning-heavy phases → deep-reasoner  
Mechanical work / Reading work → fast-worker  
Codex (/codex:rescue --background) is a cracked engineer on par with deep-reasoner, from a different perspective. Treat as a peer, not a reviewer.  
High-stakes decisions: task Opus + Codex on the same problem in parallel, synthesize the best of both, without showing either the other's answer. Keep your own context lean.   

Let the "fast-worker" agent handle tasks like `git commit` and `read code`.

## Project

企业级知识库 MVP：文档管理 / 混合检索 / AI 问答 (RAG) / 知识图谱。pnpm workspaces + Turborepo monorepo，Node ≥ 20，pnpm ≥ 9（安装依赖一律用 pnpm）。

## Common Commands

```bash
pnpm dev                    # 同时启动 Web(8888) + API(9999) + 文档处理 worker（infra/scripts/dev.mjs）
pnpm dev:turbo              # 只启动 Web/API，不启动 worker
pnpm build / pnpm lint      # turbo run build / lint

# 测试（Vitest，根目录 vitest.config.ts，包含 apps/{api,web}/src/**/*.spec.ts）
npx vitest run                                             # 全部测试
npx vitest run apps/api/src/modules/graph/graph.service.spec.ts   # 单个测试文件

# 提交前检查（架构约束 + Prisma validate + API/Web 类型检查 + 生产 compose 解析）
pnpm check:ci               # 或 node scripts/check-ci.mjs

# 数据库
pnpm db:migrate:dev         # Prisma 迁移（开发，生成 migration）
pnpm db:migrate:deploy      # Prisma 迁移（部署）
pnpm graph:migrate          # Neo4j 约束/索引迁移
pnpm seed                   # 演示数据（admin@demo.com / demo123 / tenant_demo）

# 基础设施
pnpm docker:up              # Postgres(55432) / Neo4j(7474) / Redis / MinIO(9101)
pnpm ocr:start              # PaddleOCR 本地服务（10096）
```

## Hard Rules (enforced by `pnpm check:architecture`)

- **PostgreSQL 结构变更只能走 Prisma Migrate**：先改 `apps/api/src/database/prisma/schema.prisma`（唯一声明来源），再用 `prisma:migrate:dev` 生成迁移。禁止手写散落 SQL、`psql` 手动执行、`prisma db push`。扩展/全文检索配置/触发器等 schema 表达不了的能力也必须放进 Prisma migration。
- **Neo4j schema 变更只能走 `pnpm graph:migrate`**，迁移文件在 `apps/api/src/database/neo4j/migrations`；API/worker 启动时不隐式改图结构。
- **环境变量只从仓库根目录加载**（`.env` / `.env.local`），不要在 `apps/*` 下新建 `.env`。API 侧 Prisma 命令通过 `apps/api/scripts/prisma-root-env.cjs` 注入根目录 env。

## Architecture

```
apps/api    NestJS 10 + Prisma + BullMQ（端口 9999，前缀 /api）
apps/web    Next.js 15 App Router + Tailwind + Zustand + SWR（端口 8888）
packages/schemas   Zod schemas，前后端共享类型（@ai-knowledge/schemas）
packages/authz     @xiaoli-byte/authz — 与 ai-call 仓库共享的统一鉴权包（发布到 GitHub Packages）
packages/config    共享 tsconfig
services/paddleocr-server   Python 3.11 本地 OCR HTTP 服务
```

### API 进程模型（关键）

后端是**双进程**：`src/main.ts`（HTTP API）+ `src/worker.ts`（BullMQ 文档处理 worker）。上传接口只负责 MinIO putObject + DB insert (PENDING) + 入队；解析、OCR/ASR（PaddleOCR/FunASR）、切片、向量化（DashScope text-embedding-v4 → pgvector）、实体抽取（→ Neo4j）全部在 worker 里完成，状态流转 PARSING → CHUNKING → EMBEDDING → READY。改文档处理逻辑时注意两个入口都要考虑。

### 数据权威源分工

- **PostgreSQL 16 + pgvector**：业务数据、向量（HNSW）、图谱的证据/治理/审计权威源。
- **Neo4j 5.x**：图结构存储与查询（探索、路径、合并）。
- **Redis 7**：缓存 + BullMQ 队列；**MinIO**：原始文件对象存储。

### 检索与问答链路

混合检索 = PostgreSQL 全文（jieba 分词）+ pgvector 双路召回 + RRF 融合（`modules/search`）。QA（`modules/qa`）是管道结构：会话记忆（滚动摘要存 `qa_conversations.summary` + 最近轮次全文，`conversation-memory.service`）→ LLM 查询改写（`query-planner.service`）→ hybridSearch 召回 → 权限/AI 引用过滤 → DashScope gte-rerank 重排（`embeddings/rerank.service`，失败降级召回原序）→ 多轮 messages 生成（`qwen-plus` SSE）→ 落库 + `qa_run_logs` 调试日志 + 异步摘要更新。未配 DashScope key 时可 `DASHSCOPE_LLM_MOCK=true`（rerank/embedding 同理有 mock 开关）。

### 鉴权与多租户

JWT 双 token + Passport；租户上下文用 `nestjs-cls` 全链路注入 tenantId，业务表带 tenantId。文档/文件夹有数据级 ACL（subjectType USER/DEPT/ROLE + `visibleWhereSql()`）。统一鉴权正在向 `packages/authz` 共享包重构，设计规范见 `docs/authz-architecture.md`（该文件与 ai-call 仓库各存一份，**改动必须双向同步**）。

### 前端约定

- 网络请求封装在 `apps/web/src/services/`，按模块一个文件，具名 export + default 聚合对象（`import xxxApi from '@/services/xxx'`），底层用 `@/lib/api-client`。
- `@` 别名指向 `apps/web/src`。

## Docs

`docs/USAGE.md`（使用手册）、`docs/DEPLOYMENT.md`（部署）、`docs/TODO.md`（路线图）、`docs/authz-architecture.md` + `docs/authz-implementation-backlog.md`（鉴权重构设计与待办）。
