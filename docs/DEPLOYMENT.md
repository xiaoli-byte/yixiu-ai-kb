# AI 知识库 - 部署指南

> 详细的部署文档，涵盖开发环境、生产环境以及各种部署方式。

---

## 目录

1. [环境要求](#1-环境要求)
2. [快速部署（开发环境）](#2-快速部署开发环境)
3. [生产环境部署](#3-生产环境部署)
4. [Docker 部署](#4-docker-部署)
5. [Kubernetes 部署](#5-kubernetes-部署)
6. [环境变量配置](#6-环境变量配置)
7. [数据库配置](#7-数据库配置)
8. [反向代理配置](#8-反向代理配置)
9. [安全配置](#9-安全配置)
10. [监控与日志](#10-监控与日志)
11. [备份与恢复](#11-备份与恢复)
12. [常见问题](#12-常见问题)

---

## 1. 环境要求

### 1.1 硬件要求

#### 开发环境


| 资源  | 最低要求  |
| --- | ----- |
| CPU | 2 核   |
| 内存  | 4 GB  |
| 磁盘  | 20 GB |


#### 生产环境（小型）


| 资源  | 最低要求   | 推荐         |
| --- | ------ | ---------- |
| CPU | 4 核    | 8 核        |
| 内存  | 8 GB   | 16 GB      |
| 磁盘  | 100 GB | 500 GB SSD |


#### 生产环境（中型）


| 资源  | 最低要求       | 推荐       |
| --- | ---------- | -------- |
| CPU | 8 核        | 16 核     |
| 内存  | 16 GB      | 32 GB    |
| 磁盘  | 500 GB SSD | 1 TB SSD |


### 1.2 软件要求


| 软件             | 版本要求   |
| -------------- | ------ |
| Node.js        | ≥ 20.x |
| pnpm           | ≥ 9.x  |
| Docker         | ≥ 24.x |
| Docker Compose | ≥ 2.x  |


### 1.3 外部服务


| 服务            | 说明        | 必填  |
| ------------- | --------- | --- |
| DashScope API | 通义千问 LLM / Embedding / gte-rerank 重排 | 是   |
| PostgreSQL 16 | 主数据库 + 向量 | 是   |
| Neo4j 5.x     | 图数据库      | 是   |
| Redis 7       | 缓存和队列     | 是   |
| MinIO         | S3 兼容存储   | 是   |
| PaddleOCR 服务 | 图片/扫描 PDF OCR（`services/paddleocr-server`，`pnpm ocr:start` 启动，端口 10096） | 解析图片/扫描件时需要 |
| FunASR 服务    | 音频/视频 ASR 转写（HTTP，端口 10095） | 解析音视频时需要 |


---

## 2. 快速部署（开发环境）

### 2.1 克隆项目

```bash
git clone <repository-url>
cd ai-knowledge
```

### 2.2 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入必要配置
nano .env
```

**必须配置项：**

```env
# DashScope API Key（必填）
DASHSCOPE_API_KEY=your_api_key_here

# Bootstrap 管理员账号
BOOTSTRAP_ADMIN_EMAIL=admin@yourcompany.com
BOOTSTRAP_ADMIN_PASSWORD=CHANGE_ME_use_a_strong_unique_admin_password
```

**前端 API 地址（构建期变量，必填、无回退值）：**

`NEXT_PUBLIC_API_URL` 是 Next.js 构建期内联变量，前端代码在缺失时会直接抛错。两种运行形态取值不同：

```env
# 形态一：独立部署（8888 根路径直接访问）
NEXT_PUBLIC_API_URL=/api

# 形态二：作为 ai-call 微前端（Multi-Zones）内嵌运行 —— 当前开发环境的实际形态
WEB_BASE_PATH=/knowledge
NEXT_PUBLIC_API_URL=/knowledge/api
API_INTERNAL_URL=http://127.0.0.1:9999/api
```

> zone 形态下所有页面与 `/_next` 资源挂在 `/knowledge` 前缀下，由 ai-call 网关将 `/knowledge/api/*` 分流到本项目 API。这三个都是构建期生效的变量，修改后必须重新构建/重启 Web（`next dev` 需重启，生产需重新 build）。前端代码中禁止硬编码 `/api` 前缀，统一从 `@/lib/api/client` 导出的 `apiBaseUrl` 取值，否则 zone 模式下必 404。详见 ai-call 仓 `docs/knowledge-base-microfrontend.md`。

### 2.3 启动基础设施

```bash
# 使用 Docker Compose 启动所有依赖服务
docker compose up -d

# 验证服务状态
docker compose ps

# 预期输出：
# NAME                STATUS
# ai-knowledge-redis-1    running
# ai-knowledge-minio-1     running
# ai-knowledge-neo4j-1    running
# ai-knowledge-postgres-1  running
```

开发环境宿主机端口从根目录 `.env` 插值，默认避开常见占用端口：

| 服务 | 宿主机端口 | 说明 |
| --- | --- | --- |
| PostgreSQL | 56432 | 避开 5432 与部分 Windows 保留的 55432，`DATABASE_URL` 必须与其一致 |
| Redis | 6399 | 避开 6379/6380 |
| MinIO / Console | 9100 / 9101 | 避开 9000/9001 |
| Neo4j HTTP / Bolt | 7474 / 7687 | 默认 |

### 2.4 初始化数据库

```bash
# 安装依赖
pnpm install

# 生成 Prisma Client
pnpm --filter @ai-knowledge/api prisma:generate

# 执行 Prisma Migrate 迁移
pnpm --filter @ai-knowledge/api prisma:migrate:deploy

# 执行 Neo4j schema migrations
pnpm graph:migrate

# 初始化演示数据（可选）
pnpm seed
```

> 知识图谱治理能力依赖 PostgreSQL 迁移 `0005_graph_governance_views` 和 Neo4j 迁移 `0002_graph_governance`；检索历史和问答反馈依赖 PostgreSQL 迁移 `0006_search_qa_enhancements`。升级已有环境时，先执行 `pnpm --filter @ai-knowledge/api prisma:migrate:deploy`，再执行 `pnpm graph:migrate`，确保图谱治理、检索历史和问答反馈相关字段/索引已就绪。

> **升级到含标签下线 / QA 重写版本的注意事项**：
> - `0010_drop_tags` 会**永久删除** `tags` / `document_tags` 表及其数据（标签功能已整体下线，图谱分类改用文件夹）。若历史标签数据仍有价值，升级前先备份这两张表。
> - `0011_qa_conversation_rolling_summary` 为 `qa_conversations` 增加滚动摘要字段（`summary`、`summary_message_count`），QA 长会话记忆依赖它。
> - `0012_federated_user_lifecycle` 为 `users` 增加非空 `status` 与 `(tenant_id, status)` 索引。ai-call 停用账号同步为 `inactive`、删除同步为 `deleted`；两者保留用户行，以维持文档 owner 和审计追溯。
> - QA 检索重排使用 DashScope gte-rerank，默认模型 `gte-rerank-v2`（`DASHSCOPE_RERANK_MODEL` 可覆盖）；无法调用时自动降级为召回原序，不阻塞问答。联调无 Key 环境可设 `DASHSCOPE_LLM_MOCK` / `DASHSCOPE_EMBED_MOCK` / `DASHSCOPE_RERANK_MOCK=true`。

> 数据库业务结构变更必须先更新 `apps/api/src/database/prisma/schema.prisma`，再通过 Prisma Migrate 生成/部署迁移。禁止使用散落 SQL 脚本、手动 `psql` 或 `prisma db push` 修改业务表结构；Prisma Migrate 生成的迁移 SQL 除外。
> Neo4j 约束和索引通过 `apps/api/src/database/neo4j/migrations` 下的 Cypher migrations 管理；API/worker 启动时不负责图数据库 schema 变更。
> API 运行时代码通过 `AppConfigService` 读取类型化配置；新增基础设施配置时先更新 env schema，再暴露 typed getter。

### 2.5 启动开发服务

```bash
# 启动所有服务
pnpm dev

# 或分别启动
pnpm --filter @ai-knowledge/api dev    # 后端 (端口 9999)
pnpm --filter @ai-knowledge/web dev    # 前端 (端口 8888)
```

### 2.6 验证部署

| 服务 | 地址 | 验证方式 |
| --- | --- | --- |
| 前端 | [http://localhost:8888](http://localhost:8888) | 浏览器访问 |
| 后端 API | [http://localhost:9999/api](http://localhost:9999/api) | 返回 API 信息 |
| 健康检查 | [http://localhost:9999/health](http://localhost:9999/health) | 返回 `{"status":"ok"}` |
| MinIO Console | [http://localhost:9101](http://localhost:9101) | 登录界面 |
| Neo4j Browser | [http://localhost:7474](http://localhost:7474) | 登录界面 |


---

## 3. 生产环境部署

### 3.1 准备工作

#### 服务器准备

```bash
# 创建部署目录
mkdir -p /opt/ai-knowledge
cd /opt/ai-knowledge

# 创建数据目录
mkdir -p data/postgres data/neo4j data/minio data/redis
mkdir -p logs/nginx logs/api logs/web
```

#### 安装依赖

```bash
# 安装 Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 安装 pnpm
npm install -g pnpm@9

# 安装 Docker
curl -fsSL https://get.docker.com | bash
docker compose version
```

### 3.2 构建生产版本

```bash
# 克隆项目
git clone <repository-url> .
cd ai-knowledge

# 安装依赖
pnpm install --frozen-lockfile

# 生成 Prisma Client
pnpm --filter @ai-knowledge/api prisma:generate

# 构建生产版本
pnpm --filter @ai-knowledge/api build
pnpm --filter @ai-knowledge/web build
```

> Web 构建必须提供 `NEXT_PUBLIC_API_URL`（构建期内联，缺失时前端运行时直接抛错）。Docker 部署时由 `docker-compose.prod.yml` 的 build args 固定为 `/api`（独立部署形态）；若生产也要以 ai-call 微前端形态运行，需把 build args 改为 `WEB_BASE_PATH=/knowledge`、`NEXT_PUBLIC_API_URL=/knowledge/api` 后重新构建镜像。

### 3.3 配置生产环境变量

创建 `.env.production` 文件（与当前实际生产配置结构一致；密钥请替换为真实强随机值）：

```env
# ===== 应用基础配置 =====
NODE_ENV=production
API_PORT=9999
WEB_PORT=8888
LOG_LEVEL=info
# 注意：NEXT_PUBLIC_API_URL / WEB_BASE_PATH 不在此文件配置——
# 它们是构建期变量，由 docker-compose.prod.yml 的 web build args 提供（默认 /api）

# ===== PostgreSQL =====
POSTGRES_USER=ai_knowledge
POSTGRES_PASSWORD=CHANGE_ME_use_a_strong_postgres_password
POSTGRES_DB=ai_knowledge
POSTGRES_PORT=55432

# ===== Redis =====
REDIS_PORT=6379

# ===== MinIO =====
MINIO_ROOT_USER=minio_admin
MINIO_ROOT_PASSWORD=CHANGE_ME_use_a_strong_minio_root_password
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
MINIO_PUBLIC_URL=http://localhost/minio
S3_BUCKET=ai-knowledge-docs
S3_REGION=us-east-1
S3_ACCESS_KEY=minio_admin
S3_SECRET_KEY=CHANGE_ME_use_a_strong_s3_secret_key

# ===== Neo4j =====
# 当前生产约定：neo4j.conf 已关闭 auth，此处留空让驱动以无认证方式连接；
# 不要写占位假密码（会触发 Neo4j 5.x 配置校验失败）。若开启 auth 则填真实密码。
NEO4J_PASSWORD=

# ===== 鉴权 =====
JWT_ACCESS_SECRET=CHANGE_ME_generate_with_openssl_rand_base64_64
JWT_REFRESH_SECRET=CHANGE_ME_generate_with_openssl_rand_base64_64
# KB-10：本服务自己的 RS256 密钥对
JWT_ACCESS_ALGORITHM=RS256
JWT_ACCESS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nCHANGE_ME\n-----END PRIVATE KEY-----"
JWT_ACCESS_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nCHANGE_ME\n-----END PUBLIC KEY-----"
JWT_ACCESS_KEY_ID=ai-knowledge-v1
# 仅接收 ai-call 的公钥，绝不部署 ai-call 私钥
FEDERATED_JWT_ACCESS_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nCHANGE_ME_ai_call_public_key\n-----END PUBLIC KEY-----"
FEDERATED_JWT_ACCESS_KEY_ID=ai-call-v1
BOOTSTRAP_ADMIN_EMAIL=admin@yourcompany.com
BOOTSTRAP_ADMIN_PASSWORD=CHANGE_ME_use_a_strong_unique_admin_password
BOOTSTRAP_ADMIN_NAME=Super Admin
BOOTSTRAP_TENANT_ID=tenant_yourcompany

# ===== DashScope (必填) =====
DASHSCOPE_API_KEY=CHANGE_ME_set_real_dashscope_api_key
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/api/v1
DASHSCOPE_LLM_MODEL=qwen-plus
DASHSCOPE_EMBED_MODEL=text-embedding-v4
DASHSCOPE_EMBED_DIM=1024
DASHSCOPE_LLM_MOCK=false
DASHSCOPE_EMBED_MOCK=false
# QA 检索重排（compose 显式注入且 env 校验要求非空，必须配置；MOCK=true 时保持召回原序）
DASHSCOPE_RERANK_MODEL=gte-rerank-v2
DASHSCOPE_RERANK_MOCK=false

# ===== 检索参数 =====
SEARCH_BM25_TOPK=50
SEARCH_VECTOR_TOPK=50
SEARCH_RRF_K=60
SEARCH_RRF_FINAL_TOPK=10
CHUNK_SIZE=500
CHUNK_OVERLAP=50
EMBED_BATCH_SIZE=10

# ===== 多模态解析 =====
PADDLEOCR_HTTP_URL=http://localhost:10096/ocr
PADDLEOCR_PORT=10096
PADDLEOCR_LANG=ch
PADDLEOCR_UPLOAD_FIELD=image
PADDLEOCR_LANG_FIELD=lang
PADDLEOCR_TIMEOUT_MS=600000
PADDLEOCR_USE_ANGLE_CLS=false
OCR_PDF_RENDER_SCALE=2
OCR_PDF_MAX_PAGES=0
DOCUMENT_UPLOAD_MAX_MB=100
# FunASR（音视频转写）：compose 会把该变量注入 API/worker 且 env 校验要求非空，
# 即使暂未部署 FunASR 也保留占位地址，仅在实际解析音视频时才会真正调用
FUNASR_HTTP_URL=http://localhost:10095
FUNASR_TIMEOUT_MS=600000
```

> **生产启动校验**：`NODE_ENV=production` 时 API 会拒绝使用占位/示例值启动，`DATABASE_URL`、`JWT_ACCESS_SECRET`、`JWT_REFRESH_SECRET`、`S3_SECRET_KEY`、`BOOTSTRAP_ADMIN_PASSWORD` 等必须是真实值，请务必替换所有 `CHANGE_ME_*`。**KB-10** 要求 `JWT_ACCESS_ALGORITHM=RS256`，且本服务私钥/公钥与 ai-call 的 `FEDERATED_JWT_ACCESS_PUBLIC_KEY` 均已配置；本服务绝不持有 ai-call 私钥。若以 ai-call 联合身份运行，`SERVICE_API_TOKEN` 必须与 ai-call 的 `KNOWLEDGE_SERVICE_API_TOKEN` 完全一致；它同时保护检索与 `PUT /api/federation/users/sync`、`DELETE /api/federation/users/:id` 生命周期端点。两服务在低峰重启后，等待旧 HS256 access token 自然过期再验收。

### 3.4 启动生产服务

使用 Docker Compose 启动所有服务（推荐）：

```bash
# 启动所有服务（使用生产环境配置）
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# 查看状态
docker compose -f docker-compose.prod.yml --env-file .env.production ps

# 查看日志
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f
```

### 3.5 替代方案：手动 Docker 运行

如果不使用 Docker Compose，可以手动启动容器：

```bash
# 启动基础设施服务
docker compose up -d postgres neo4j redis minio

# 构建镜像
docker build -t ai-knowledge/api -f apps/api/Dockerfile .
docker build -t ai-knowledge/web -f apps/web/Dockerfile .

# 运行容器
docker run -d --name ai-knowledge-api \
  --env-file .env.production \
  --network ai-knowledge_default \
  -p 9999:9999 \
  ai-knowledge/api

docker run -d --name ai-knowledge-web \
  -p 8888:8888 \
  ai-knowledge/web
```

### 3.6 替代方案：PM2 运行（非 Docker）

仅适用于开发/测试环境，生产环境推荐使用 Docker：

```bash
# 安装 PM2
npm install -g pm2

# 启动后端
cd /opt/ai-knowledge/apps/api
pm2 start dist/main.js --name api -i 2

# 启动前端
cd /opt/ai-knowledge/apps/web
pm2 serve out 8888 --name web &
```

---

## 4. Docker 部署

### 4.1 前置准备

Docker Compose 部署依赖以下配置文件：

```bash
# 项目结构
ai-knowledge/
├── docker-compose.prod.yml    # 生产环境 Docker Compose 配置
├── .env.production            # 生产环境变量（需创建）
├── infra/
│   ├── nginx/
│   │   ├── nginx.conf        # Nginx 主配置
│   │   └── conf.d/
│   │       └── default.conf   # 反向代理配置
│   └── docker/
│       └── postgres/
│           └── init.sql       # PostgreSQL 历史基线参考；运行时结构由 Prisma migrations 回放
└── apps/
    ├── api/Dockerfile         # API 服务 Dockerfile（包含 Prisma/Neo4j migrations）
    └── web/Dockerfile         # Web 前端 Dockerfile
```

### 4.2 配置环境变量

创建 `.env.production` 文件：

```bash
cp .env.example .env.production
```

必须配置项与 [3.3 配置生产环境变量](#33-配置生产环境变量) 完全一致，按该节模板填写（注意生产启动校验会拒绝 `CHANGE_ME_*` 占位值）。

**Web 镜像的构建期参数**（不走 `.env.production`）：

`docker-compose.prod.yml` 中 web 服务通过 build args 固定前端形态，默认为独立部署：

```yaml
  web:
    build:
      args:
        NEXT_PUBLIC_API_URL: /api
        API_INTERNAL_URL: http://api:9999/api
```

若要以 ai-call 微前端（zone）形态部署，需把 `NEXT_PUBLIC_API_URL` 改为 `/knowledge/api`，并在 `apps/web/Dockerfile` 补充 `WEB_BASE_PATH` 的 `ARG`/`ENV` 透传（当前 Dockerfile 只声明了 `NEXT_PUBLIC_API_URL` / `API_INTERNAL_URL` 两个构建参数），再重新 `docker compose build web`——这些是构建期内联变量，改运行时环境变量不生效。

### 4.3 启动 Docker 部署

使用生产环境专用配置：

```bash
# 启动所有服务（使用 docker-compose.prod.yml）
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# 查看服务状态
docker compose -f docker-compose.prod.yml --env-file .env.production ps

# 查看日志
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f

# 查看特定服务日志
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f api
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f web
```

**预期输出：**

```
NAME                    STATUS
ai-knowledge-postgres   running (healthy)
ai-knowledge-neo4j      running (healthy)
ai-knowledge-redis      running (healthy)
ai-knowledge-minio      running (healthy)
ai-knowledge-api        running
ai-knowledge-web        running
ai-knowledge-nginx      running
```

### 4.4 初始化 MinIO Bucket

```bash
# 等待 MinIO 启动
sleep 10

# 创建 Bucket（使用 Docker 网络内地址）
docker exec ai-knowledge-minio mc alias set local http://localhost:9000 ${S3_ACCESS_KEY} ${S3_SECRET_KEY}
docker exec ai-knowledge-minio mc mb local/ai-knowledge-docs --ignore-existing
docker exec ai-knowledge-minio mc anonymous set download local/ai-knowledge-docs
```

### 4.5 验证部署

| 服务 | 地址 | 验证方式 |
| --- | --- | --- |
| 前端 | [http://localhost](http://localhost) | 浏览器访问（通过 Nginx） |
| 后端 API | [http://localhost/api](http://localhost/api) | 返回 API 信息 |
| 健康检查 | [http://localhost/api/health](http://localhost/api/health) | 返回 `{"status":"ok"}` |
| MinIO Console | [http://localhost:9101](http://localhost:9101) | 登录界面 |

---

## 5. Kubernetes 部署

### 5.1 前置要求

- Kubernetes 1.24+
- kubectl 配置完成
- 存储类支持 PersistentVolume

### 5.2 Namespace

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: ai-knowledge
```

### 5.3 ConfigMap

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ai-knowledge-config
  namespace: ai-knowledge
data:
  NODE_ENV: "production"
  API_PORT: "9999"
  WEB_PORT: "8888"
  WEB_ORIGIN: "https://your-domain.com"
```

### 5.4 Secret

```yaml
# k8s/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: ai-knowledge-secret
  namespace: ai-knowledge
type: Opaque
stringData:
  DATABASE_URL: "postgresql://ai_knowledge:CHANGE_ME_use_a_strong_postgres_password@postgres:5432/ai_knowledge"
  REDIS_URL: "redis://redis:6379"
  NEO4J_URI: "bolt://neo4j:7687"
  NEO4J_USER: "neo4j"
  NEO4J_PASSWORD: "CHANGE_ME_use_a_strong_neo4j_password"
  JWT_ACCESS_SECRET: "CHANGE_ME_generate_with_openssl_rand_base64_64"
  JWT_REFRESH_SECRET: "CHANGE_ME_generate_with_openssl_rand_base64_64"
  DASHSCOPE_API_KEY: "CHANGE_ME_set_real_dashscope_api_key"
  S3_ACCESS_KEY: "minio_admin"
  S3_SECRET_KEY: "CHANGE_ME_use_a_strong_s3_secret_key"
```

### 5.5 Deployment (API)

```yaml
# k8s/api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: ai-knowledge
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: your-registry/ai-knowledge-api:latest
          ports:
            - containerPort: 9999
          envFrom:
            - configMapRef:
                name: ai-knowledge-config
            - secretRef:
                name: ai-knowledge-secret
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "2Gi"
              cpu: "1000m"
          livenessProbe:
            httpGet:
              path: /health
              port: 9999
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 9999
            initialDelaySeconds: 5
            periodSeconds: 5
```

### 5.6 Service (API)

```yaml
# k8s/api-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: ai-knowledge
spec:
  selector:
    app: api
  ports:
    - port: 9999
      targetPort: 9999
  type: ClusterIP
```

### 5.7 Ingress

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ai-knowledge-ingress
  namespace: ai-knowledge
  annotations:
    nginx.ingress.kubernetes.io/proxy-body-size: "100m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
spec:
  ingressClassName: nginx
  rules:
    - host: your-domain.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 9999
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 8888
```

### 5.8 部署命令

```bash
# 创建 Namespace 和资源
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/postgres-deployment.yaml
kubectl apply -f k8s/redis-deployment.yaml
kubectl apply -f k8s/neo4j-deployment.yaml
kubectl apply -f k8s/minio-deployment.yaml
kubectl apply -f k8s/api-deployment.yaml
kubectl apply -f k8s/web-deployment.yaml
kubectl apply -f k8s/ingress.yaml

# 查看部署状态
kubectl get pods -n ai-knowledge

# 查看日志
kubectl logs -f deployment/api -n ai-knowledge
```

---

## 6. 环境变量配置

### 6.1 完整环境变量列表

> **注意**：生产环境使用 Docker Compose 时，变量值从 `.env.production` 插值，但 compose 不再使用全量 `env_file` 注入；每个 service 只显式接收自己需要的最小变量集。API 服务使用 `DATABASE_URL`、`REDIS_URL` 等标准格式；PostgreSQL、Redis 等基础服务使用独立配置变量（如 `POSTGRES_USER`、`POSTGRES_PASSWORD` 等）。生产 compose 会拆分 API 与文档处理 worker，并通过一次性 `graph-init` 服务执行 Neo4j schema migrations：API 覆盖为 `DOCUMENT_WORKER_ENABLED=false`，独立 `worker` 服务覆盖为 `true`。

生产服务启动后建议执行 `pnpm smoke:deploy -- --env-file .env.production`，确认 `db-init`、`graph-init`、API/Web、Redis、Neo4j、MinIO 都处于可用状态。若自动化环境的 pnpm 包装层在进入项目脚本前触发非交互安装确认，可直接执行 `node scripts/smoke-deploy.mjs --env-file .env.production`。

| 变量名 | 说明 | 默认值 | 必填 |
| --- | --- | --- | --- |
| `NODE_ENV` | 运行环境 | development | - |
| `API_PORT` | API 端口 | 9999 | - |
| `WEB_PORT` | 前端端口 | 8888 | - |
| `WEB_ORIGIN` | Web 对外源（CORS 等） | http://localhost:8888 | 是 |
| `LOG_LEVEL` | 日志级别 | info | 是 |
| `APP_TIME_ZONE` | AI 问答"现在/今天"等时间计算时区 | Asia/Shanghai | 是 |
| `NEXT_PUBLIC_API_URL` | 前端 API 前缀（**构建期内联，无回退值**；独立部署 `/api`，zone 形态 `/knowledge/api`） | - | 是 |
| `WEB_BASE_PATH` | zone 形态页面/资源前缀（构建期），如 `/knowledge` | 空（独立部署） | - |
| `API_INTERNAL_URL` | Web 服务端（SSR/rewrites）直连 API 的内网地址 | - | - |
| `NEXT_PUBLIC_DEMO_MODE` | 登录页预填演示账号 | false | - |
| `DATABASE_URL` | PostgreSQL 连接地址（API 使用） | - | 是 |
| `POSTGRES_USER` | PostgreSQL 用户名 | ai_knowledge | - |
| `POSTGRES_PASSWORD` | PostgreSQL 密码 | - | 是 |
| `POSTGRES_DB` | PostgreSQL 数据库名 | ai_knowledge | - |
| `REDIS_URL` | Redis 连接地址（API 使用） | redis://redis:6379 | 是 |
| `REDIS_PORT` | Redis 端口 | 6379 | - |
| `NEO4J_URI` | Neo4j Bolt 地址 | bolt://localhost:7687 | 是 |
| `NEO4J_USER` | Neo4j 用户名 | neo4j | 是 |
| `NEO4J_PASSWORD` | Neo4j 密码 | - | 是 |
| `MINIO_ENDPOINT` | MinIO 内部端点主机 | minio | 是 |
| `MINIO_PORT` | MinIO 内部端口 | 9000 | 是 |
| `MINIO_PUBLIC_URL` | MinIO 对外访问地址 | https://your-domain.com/minio | 是 |
| `S3_REGION` | 区域 | us-east-1 | - |
| `S3_BUCKET` | Bucket 名称 | ai-knowledge-docs | - |
| `S3_ACCESS_KEY` | S3 Access Key | - | 是 |
| `S3_SECRET_KEY` | S3 Secret Key | - | 是 |
| `JWT_ACCESS_SECRET` | Access Token 密钥 | - | 是 |
| `JWT_REFRESH_SECRET` | Refresh Token 密钥 | - | 是 |
| `JWT_ACCESS_TTL` | Access Token 有效期 | 15m | - |
| `JWT_REFRESH_TTL` | Refresh Token 有效期 | 30d | - |
| `BOOTSTRAP_ADMIN_EMAIL` | 初始管理员邮箱 | - | 是 |
| `BOOTSTRAP_ADMIN_PASSWORD` | 初始管理员密码 | - | 是 |
| `BOOTSTRAP_ADMIN_NAME` | 初始管理员名称 | - | - |
| `BOOTSTRAP_TENANT_ID` | 初始租户 ID | - | 是 |
| `DASHSCOPE_API_KEY` | 通义千问 API Key | - | 是 |
| `DASHSCOPE_BASE_URL` | DashScope API 地址 | https://dashscope.aliyuncs.com/api/v1 | - |
| `DASHSCOPE_LLM_MODEL` | LLM 模型 | qwen-plus | - |
| `DASHSCOPE_EMBED_MODEL` | Embedding 模型 | text-embedding-v4 | - |
| `DASHSCOPE_EMBED_DIM` | Embedding 维度 | 1024 | - |
| `DASHSCOPE_LLM_MOCK` | 模拟 LLM 调用 | false | - |
| `DASHSCOPE_EMBED_MOCK` | 模拟 Embedding 调用 | false | - |
| `DASHSCOPE_RERANK_MODEL` | QA 检索重排模型 | gte-rerank-v2 | - |
| `DASHSCOPE_RERANK_MOCK` | 模拟重排（保持召回原序） | false | - |
| `SERVICE_API_TOKEN` | 服务间调用令牌（ai-call → `/search/retrieve`、`/federation/users/*`）；生产必配，开发缺省放行但仍强制租户隔离 | - | 生产是 |
| `SERVICE_API_REQUIRE_SIGNATURE` | 服务间调用是否要求时间戳签名（防重放） | false | - |
| `CHUNK_SIZE` | 切片大小 | 500 | - |
| `CHUNK_OVERLAP` | 切片重叠 | 50 | - |
| `SEARCH_BM25_TOPK` | BM25 召回数 | 50 | - |
| `SEARCH_VECTOR_TOPK` | 向量召回数 | 50 | - |
| `SEARCH_RRF_K` | RRF K 值 | 60 | - |
| `SEARCH_RRF_FINAL_TOPK` | 最终返回数 | 10 | - |
| `EMBED_BATCH_SIZE` | Embedding 批处理大小 | 10 | - |
| `FUNASR_HTTP_URL` | FunASR 音视频转写服务地址 | http://localhost:10095 | 是 |
| `FUNASR_TIMEOUT_MS` | FunASR 超时（毫秒） | 600000 | - |
| `PADDLEOCR_HTTP_URL` | PaddleOCR 服务地址 | http://localhost:10096/ocr | 是 |
| `PADDLEOCR_LANG` | OCR 语言 | ch | - |
| `PADDLEOCR_TIMEOUT_MS` | OCR 超时（毫秒） | 600000 | - |
| `OCR_PDF_RENDER_SCALE` | 扫描 PDF 渲染倍率 | 2 | - |
| `OCR_PDF_MAX_PAGES` | 扫描 PDF 最大 OCR 页数（0 不限） | 0 | - |
| `DOCUMENT_UPLOAD_MAX_MB` | 上传大小上限（MB），Nginx `client_max_body_size` 需同步 | 100 | - |
| `DOCUMENT_WORKER_ENABLED` | 是否启动文档队列消费者；生产 compose 由 api/worker 服务分别覆盖 | true | 是 |
| `DOCUMENT_WORKER_CONCURRENCY` | 文档处理 worker 并发数 | 1 | 是 |

### 6.2 环境特定配置

#### 开发环境

```env
NODE_ENV=development
LOG_LEVEL=debug
```

#### 生产环境

```env
NODE_ENV=production
LOG_LEVEL=info
JWT_ACCESS_SECRET=<生成 32 位以上随机字符串>
JWT_REFRESH_SECRET=<生成 32 位以上随机字符串>
```

#### 测试环境

```env
NODE_ENV=test
LOG_LEVEL=debug
```

---

## 7. 数据库配置

### 7.1 PostgreSQL 配置

#### 生产环境推荐配置 (postgresql.conf)

```ini
# 连接配置
max_connections = 200
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB

# 查询优化
random_page_cost = 1.1
effective_io_concurrency = 200

# 写入配置
wal_buffers = 64MB
checkpoint_completion_target = 0.9
max_wal_size = 4GB

# pgvector 配置
shared_memory_type = mmap
dynamic_shared_memory_type = posix

# 日志
log_destination = 'csvlog'
logging_collector = on
log_min_duration_statement = 1000
```

### 7.2 Neo4j 配置

#### 生产环境推荐配置 (neo4j.conf)

```properties
# 内存配置
dbms.memory.heap.initial_size=2g
dbms.memory.heap.max_size=4g
dbms.memory.pagecache.size=2g

# 连接配置
dbms.connector.bolt.thread_pool_min_size=5
dbms.connector.bolt.thread_pool_max_size=100

# APOC 配置
dbms.security.procedures.unrestricted=apoc.*

# 事务配置
dbms.transaction.timeout=60s
```

### 7.3 Redis 配置

```conf
# 内存配置
maxmemory 2gb
maxmemory-policy allkeys-lru

# 持久化
appendonly yes
appendfsync everysec

# 连接配置
timeout 300
tcp-keepalive 60
```

---

## 8. 反向代理配置

### 8.1 Docker 环境 Nginx 配置（默认）

当使用 Docker Compose 部署时，Nginx 使用以下配置代理到 Docker 服务：

> 项目已提供默认配置：`infra/nginx/nginx.conf` 和 `infra/nginx/conf.d/default.conf`

```nginx
resolver 127.0.0.11 ipv6=off valid=10s;

server {
    listen 80;
    server_name localhost;

    # API 代理
    location /api/ {
        set $api_backend "http://api:9999";
        proxy_pass $api_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    # Next.js 静态资源
    location /_next/static/ {
        proxy_pass http://web:8888;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, immutable";
    }

    # Web 前端
    location / {
        proxy_pass http://web:8888;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 8.2 独立服务器 Nginx 配置

适用于在独立服务器（非 Docker）上部署时的 Nginx 配置：

```nginx
# /etc/nginx/nginx.conf

worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # 日志格式
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" '
                    'rt=$request_time';

    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log warn;

    # 性能配置
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml application/xml+rss text/javascript application/x-javascript;

    # 上传大小限制
    client_max_body_size 100m;

    # 超时配置
    proxy_read_timeout 300s;
    proxy_connect_timeout 75s;
    proxy_send_timeout 300s;

    include /etc/nginx/conf.d/*.conf;
}
```

### 8.3 独立服务器站点配置

```nginx
# /etc/nginx/conf.d/ai-knowledge.conf

upstream api_backend {
    server localhost:9999;
    keepalive 64;
}

upstream web_backend {
    server localhost:8888;
    keepalive 32;
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 配置
    ssl_certificate /etc/ssl/certs/your-cert.pem;
    ssl_certificate_key /etc/ssl/private/your-key.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # 前端
    location / {
        proxy_pass http://web_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # API
    location /api {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # SSE 支持
        proxy_buffering off;
        proxy_cache off;
    }
}
```

### 8.4 SSL 证书 (Let's Encrypt)

```bash
# 安装 Certbot
apt-get install certbot python3-certbot-nginx

# 获取证书
certbot --nginx -d your-domain.com

# 自动续期
certbot renew --dry-run
```

---

## 9. 安全配置

### 9.1 JWT 安全

```env
# 使用强随机密钥（至少 64 字符）
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
```

### 9.2 数据库安全

```sql
-- 创建应用专用用户
CREATE USER ai_app WITH PASSWORD 'strong_password';
GRANT CONNECT ON DATABASE ai_knowledge TO ai_app;
GRANT USAGE ON SCHEMA public TO ai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ai_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ai_app;
```

### 9.3 Redis 安全

```conf
# 设置密码
requirepass your_redis_password

# 禁用危险命令
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command KEYS ""
```

### 9.4 防火墙配置

```bash
# 只开放必要端口
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

---

## 10. 监控与日志

### 10.1 日志配置

```typescript
// apps/api/src/main.ts
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

app.useLogger(
  WinstonModule.createLogger({
    transports: [
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 10485760, // 10MB
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        maxsize: 10485760,
        maxFiles: 5,
      }),
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple(),
        ),
      }),
    ],
  }),
);
```

### 10.2 Prometheus 指标

```typescript
// 添加 Prometheus 指标端点
import { MetricsController } from './metrics.controller';

@Controller('metrics')
export class MetricsController {
  @Get()
  getMetrics() {
    const metrics = [
      '# HELP api_requests_total Total API requests',
      '# TYPE api_requests_total counter',
      'api_requests_total{method="GET",path="/documents"} 1234',
    ].join('\n');
    return metrics;
  }
}
```

### 10.3 健康检查

```bash
# 检查所有服务健康状态
curl http://localhost:9999/health | jq

# Docker 健康检查
docker compose ps
```

---

## 11. 备份与恢复

### 11.1 PostgreSQL 备份

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/opt/backups/postgres"
DATE=$(date +%Y%m%d_%H%M%S)
CONTAINER="postgres"

# 创建备份目录
mkdir -p $BACKUP_DIR

# 执行备份
docker exec $CONTAINER pg_dump -U ai_knowledge ai_knowledge > $BACKUP_DIR/backup_$DATE.sql

# 压缩
gzip $BACKUP_DIR/backup_$DATE.sql

# 保留最近 30 天备份
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete

echo "Backup completed: backup_$DATE.sql.gz"
```

### 11.2 Neo4j 备份

```bash
#!/bin/bash
# neo4j_backup.sh

docker exec neo4j neo4j-admin database backup --database=neo4j --to-path=/backups/neo4j_$(date +%Y%m%d)
```

### 11.3 MinIO 备份

```bash
#!/bin/bash
# minio_backup.sh

docker exec minio mc mirror local/ai-knowledge-docs /backups/minio/
```

### 11.4 定时备份 (Cron)

```bash
# 编辑 crontab
crontab -e

# 每天凌晨 3 点备份
0 3 * * * /opt/scripts/backup.sh >> /var/log/backup.log 2>&1
```

### 11.5 恢复数据

```bash
# 恢复 PostgreSQL
docker exec -i postgres psql -U ai_knowledge -d ai_knowledge < backup_20240101_030000.sql

# 恢复 Neo4j
docker exec -i neo4j neo4j-admin database restore --database=neo4j --from-path=/backups/neo4j_20240101

# 恢复 MinIO
docker exec minio mc mirror /backups/minio/ local/ai-knowledge-docs
```

---

## 12. 常见问题

### Q: Docker 容器启动失败？

```bash
# 查看详细日志
docker compose logs [service-name]

# 检查端口占用
netstat -tulpn | grep <port>

# 清理后重新启动
docker compose down -v
docker compose up -d
```

### Q: 数据库连接失败？

```bash
# 检查 PostgreSQL 状态
docker compose -f docker-compose.prod.yml --env-file .env.production ps postgres
docker compose -f docker-compose.prod.yml logs postgres

# 测试连接
docker exec -it ai-knowledge-postgres psql -U ai_knowledge -d ai_knowledge -c "SELECT 1;"

# 检查网络
docker network inspect ai-knowledge_default
```

### Q: 文档上传/处理失败？

```bash
# 检查 API 服务日志
docker compose -f docker-compose.prod.yml logs api

# 检查 MinIO 服务状态
docker compose -f docker-compose.prod.yml --env-file .env.production ps minio
docker exec -it ai-knowledge-minio mc ls local/ai-knowledge-docs

# 验证 MinIO Bucket 配置
docker exec -it ai-knowledge-minio mc anonymous get local/ai-knowledge-docs
```

### Q: zone 形态下前端请求 `/api/*` 返回 404？

`NEXT_PUBLIC_API_URL` 是构建期内联变量。zone 形态（挂在 `/knowledge` 下）时它必须是 `/knowledge/api`，且改完必须重启 `next dev` / 重新构建生产包——改运行时环境变量不生效。前端代码不允许硬编码 `/api`，统一使用 `@/lib/api/client` 导出的 `apiBaseUrl` 拼接请求地址（包括 `window.open` 打开的文件预览/下载链接）。

### Q: 联合登录（ai-call 内嵌）下接口返回 401？

联合登录走的是 ai-call 的 httpOnly cookie 会话，此时前端 store 里的 `accessToken` 是哨兵值 `COOKIE_SESSION` 而非真实 JWT。手写 `fetch` / SSE / pdfjs 请求必须：仅在 token 为真实 JWT 时附加 `Authorization: Bearer`，并始终带 `credentials: "include"`（pdfjs 用 `withCredentials: true`）。统一走 `apiClient` / `apiClient.getBlob` 则默认满足。

### Q: 前端构建失败？

```bash
# 清理缓存
pnpm store prune
rm -rf apps/web/node_modules/.cache

# 重新构建
pnpm --filter @ai-knowledge/web clean
pnpm --filter @ai-knowledge/web build
```

### Q: Neo4j 查询超时？

```bash
# 检查 Neo4j 日志
docker compose -f docker-compose.prod.yml logs neo4j | grep -i error

# 调整超时配置
# 在 docker-compose.prod.yml 的 neo4j 服务中添加：
# NEO4J_dbms_transaction_timeout=120s
```

---

## 附录：快速命令参考

### 开发环境

```bash
# 启动基础设施
docker compose up -d

# 启动开发服务
pnpm dev

# 停止所有服务
docker compose down
```

### 生产环境

```bash
# 启动所有服务
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# 停止所有服务
docker compose -f docker-compose.prod.yml --env-file .env.production down

# 查看日志
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f

# 重启特定服务
docker compose -f docker-compose.prod.yml --env-file .env.production restart [service-name]

# 进入容器
docker exec -it [container-name] bash

# 查看资源使用
docker stats

# 清理未使用的资源
docker system prune -f

# 重建特定服务
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate [service-name]
```
