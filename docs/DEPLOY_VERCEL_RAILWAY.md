# Vercel + Railway 部署指南

## 架构概览

```
┌─────────────────────┐      ┌──────────────────────┐
│  Vercel (Web)       │      │  Railway (API)        │
│  Next.js 前端        │ ───> │  NestJS API           │
│  全球 CDN            │      │  + BullMQ Worker      │
│  https://xxx.vercel.app │  │  https://xxx.up.railway.app │
└─────────────────────┘      └──────────────────────┘
                                       │
                          ┌────────────┼────────────┐
                          ▼            ▼            ▼
                      PostgreSQL     Redis      Neo4j
                  (Railway Plugin)  (Railway)  (Railway)
```

---

## 第一步：Vercel 部署 Next.js 前端

### 1.1 推送代码到 GitHub

```bash
cd I:/ai-knowledge
git add .
git commit -m "chore: add vercel config"
git push origin main
```

### 1.2 在 Vercel 创建项目

1. 访问 https://vercel.com/new
2. Import Git Repository → 选择你的仓库
3. **关键配置**：
   - **Project Name**: `ai-knowledge-web`（或自定义）
   - **Root Directory**: 点 `Edit` → 选择 `apps/web`
   - **Framework Preset**: Next.js（自动检测）
   - **Build Command**: 留空（使用 vercel.json）
   - **Install Command**: 留空（使用 vercel.json）

### 1.3 设置环境变量（在 Vercel Project Settings → Environment Variables）

```
NEXT_PUBLIC_API_BASE=https://你的-api.up.railway.app
API_INTERNAL_URL=https://你的-api.up.railway.app
```

### 1.4 部署

点击 Deploy，等待构建完成。

---

## 第二步：Railway 部署 NestJS API

### 2.1 创建项目

1. 访问 https://railway.app/new
2. **Deploy from GitHub repo** → 选择仓库
3. 项目会自动检测到 monorepo，需要手动配置

### 2.2 配置 API 服务

在 Railway 项目中：

1. **新建 Service** → GitHub Repo
2. **Settings**：
   - **Root Directory**: `apps/api`
   - **Dockerfile Path**: `apps/api/Dockerfile`（或留空自动检测）
   - **Watch Paths**: `apps/api/**`

### 2.3 添加数据库插件

在 Railway 项目中点 **New** → **Database**：

| 插件 | 用途 |
|------|------|
| PostgreSQL | 主数据库（需要 pgvector 扩展） |
| Redis | BullMQ 队列 |
| Neo4j | 图谱（可选，先关闭） |

#### ⚠️ 关于 PostgreSQL + pgvector

Railway 的 PostgreSQL 默认**不带 pgvector**。两种方案：

**方案 A（推荐）**：用 Railway 的 PostgreSQL + 自己构建 pgvector 镜像
```dockerfile
FROM postgres:16
RUN apt-get update && apt-get install -y postgresql-16-pgvector
```

**方案 B**：用外部服务
- [Neon](https://neon.tech) - 支持 pgvector（免费层）
- [Supabase](https://supabase.com) - 支持 pgvector（免费层）
- [Railway 自定义镜像](https://docs.railway.app/databases/postgresql)

### 2.4 配置环境变量（API Service → Variables）

```bash
NODE_ENV=production
API_PORT=9999

# 数据库（用 Railway 引用变量）
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Redis
REDIS_URL=${{Redis.REDIS_URL}}

# Neo4j（如果暂时不用可以留空或注释相关代码）
NEO4J_URI=${{Neo4j.BOLT_URL}}
NEO4J_USER=${{Neo4j.NEO4J_USER}}
NEO4J_PASSWORD=${{Neo4j.NEO4J_PASSWORD}}

# JWT
JWT_ACCESS_SECRET=<用 openssl rand -hex 32 生成>
JWT_REFRESH_SECRET=<用 openssl rand -hex 32 生成>
JWT_ACCESS_TTL=7d
JWT_REFRESH_TTL=7d

# 初始化管理员
BOOTSTRAP_ADMIN_EMAIL=admin@yourdomain.com
BOOTSTRAP_ADMIN_PASSWORD=<强密码>
BOOTSTRAP_ADMIN_NAME=Super Admin
BOOTSTRAP_TENANT_ID=tenant_main

# 通义千问
DASHSCOPE_API_KEY=<你的 key>
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/api/v1
DASHSCOPE_LLM_MODEL=qwen-plus
DASHSCOPE_EMBED_MODEL=text-embedding-v4
DASHSCOPE_EMBED_DIM=1024
DASHSCOPE_LLM_MOCK=false
DASHSCOPE_EMBED_MOCK=false

# MinIO / S3（推荐用 Cloudflare R2 或 AWS S3 替代 Railway 上的 MinIO）
S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
S3_ACCESS_KEY=<R2 access key>
S3_SECRET_KEY=<R2 secret key>
S3_BUCKET=ai-knowledge-docs
S3_REGION=auto
MINIO_PUBLIC_URL=https://<your-cdn-or-r2-public-url>

# CORS
WEB_ORIGIN=https://你的项目.vercel.app

# 日志
LOG_LEVEL=info
```

### 2.5 部署

Railway 会自动构建并部署。可以点 Logs 实时查看。

---

## 第三步：解决 BullMQ 持久连接问题

Railway 的免费层会休眠服务。**BullMQ Worker 需要持续运行**，建议：

1. **升级 Railway 付费**（$5/月起，按使用量）
2. **或者用外部 Worker**：
   - [Upstash Redis](https://upstash.com) + Railway Worker（分开部署）

### 改造建议：把 Worker 抽出来

如果你想最低成本稳定运行，建议把 Worker 拆成独立进程：

```ts
// apps/api/src/main.ts
if (process.env.RUN_WORKER === "true") {
  // 只启动 Worker，不启动 HTTP
  const worker = new DocumentProcessor(...);
  await worker.init();
} else {
  // 启动 NestJS API，不启动 Worker
  const app = await NestFactory.create(AppModule);
  await app.listen(9999);
}
```

然后在 Railway 部署两个 Service：
- `api-web`（NestJS HTTP，不含 Worker）
- `api-worker`（只跑 BullMQ Worker）

---

## 第四步：数据库迁移

部署成功后，在 Railway API Service 的 Shell 里执行：

```bash
pnpm --filter @ai-knowledge/api prisma:migrate:deploy
pnpm --filter @ai-knowledge/api seed  # 可选：初始化测试数据
```

---

## 第五步：验证

1. 访问 `https://你的项目.vercel.app`
2. 用 `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` 登录
3. 上传一个文档测试

---

## 故障排查

### Vercel 构建失败
- 检查 Root Directory 是否为 `apps/web`
- 检查 vercel.json 中的 build 命令路径
- 在 Vercel Logs 里看具体错误

### Railway 部署失败
- 检查 Dockerfile 路径
- 检查环境变量
- 在 Logs 里看具体错误

### Web 调 API 报 CORS 错误
- 确认 `WEB_ORIGIN` 设置为 Vercel 的域名
- 确认 API 端点 `API_INTERNAL_URL` 可公网访问

### BullMQ 锁过期（之前修过的问题）
- 已修复：`lockDuration: 5 * 60 * 1000`

---

## 成本估算

| 服务 | 免费层 | 推荐方案 |
|------|--------|----------|
| Vercel | ✅ 100GB 带宽/月 | 免费层足够 |
| Railway PostgreSQL | $5/月起 | 推荐 Hobby $5 |
| Railway Redis | $5/月起 | 推荐 Hobby $5 |
| Railway API | $5/月起 + 使用量 | 看流量 |
| Neo4j Aura | ✅ 免费 1 实例 | 用 Neo4j Cloud 免费层 |
| Cloudflare R2 | ✅ 10GB 存储 | 替代 MinIO |

**最低月成本**：约 $5-15/月（MVP 阶段）

---

## 推荐改进路径

1. **MVP**：用 Railway 一体化部署（API + DB + Redis），最快上线
2. **生产**：API 拆分为 web/worker 两个 Railway Service
3. **规模化**：Vercel Pro + 自建 K8s/VPS + 托管数据库（Neon/Upstash）
