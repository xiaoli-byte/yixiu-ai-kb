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
| 资源 | 最低要求 |
|------|----------|
| CPU | 2 核 |
| 内存 | 4 GB |
| 磁盘 | 20 GB |

#### 生产环境（小型）
| 资源 | 最低要求 | 推荐 |
|------|----------|------|
| CPU | 4 核 | 8 核 |
| 内存 | 8 GB | 16 GB |
| 磁盘 | 100 GB | 500 GB SSD |

#### 生产环境（中型）
| 资源 | 最低要求 | 推荐 |
|------|----------|------|
| CPU | 8 核 | 16 核 |
| 内存 | 16 GB | 32 GB |
| 磁盘 | 500 GB SSD | 1 TB SSD |

### 1.2 软件要求

| 软件 | 版本要求 |
|------|----------|
| Node.js | ≥ 20.x |
| pnpm | ≥ 9.x |
| Docker | ≥ 24.x |
| Docker Compose | ≥ 2.x |

### 1.3 外部服务

| 服务 | 说明 | 必填 |
|------|------|------|
| DashScope API | 通义千问 API | 是 |
| PostgreSQL 16 | 主数据库 + 向量 | 是 |
| Neo4j 5.x | 图数据库 | 是 |
| Redis 7 | 缓存和队列 | 是 |
| MinIO | S3 兼容存储 | 是 |

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
BOOTSTRAP_ADMIN_PASSWORD=your_secure_password
```

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

### 2.4 初始化数据库

```bash
# 安装依赖
pnpm install

# 生成 Prisma Client
pnpm --filter @ai-knowledge/api prisma:generate

# 推送数据库 Schema
pnpm --filter @ai-knowledge/api prisma:push

# 初始化演示数据（可选）
pnpm seed
```

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
|------|------|----------|
| 前端 | http://localhost:8888 | 浏览器访问 |
| 后端 API | http://localhost:9999/api | 返回 API 文档 |
| 健康检查 | http://localhost:9999/health | 返回 `{"status":"ok"}` |
| MinIO Console | http://localhost:9001 | 登录界面 |

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

### 3.3 配置生产环境变量

创建 `/opt/ai-knowledge/.env.production`：

```env
# ===== 应用配置 =====
NODE_ENV=production
API_PORT=9999
WEB_PORT=8888
WEB_ORIGIN=https://your-domain.com

# ===== PostgreSQL =====
DATABASE_URL=postgresql://ai_knowledge:your_password@postgres:5432/ai_knowledge

# ===== Redis =====
REDIS_URL=redis://redis:6379

# ===== Neo4j =====
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_neo4j_password

# ===== MinIO / S3 =====
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_BUCKET=ai-knowledge-docs
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key

# ===== JWT =====
JWT_ACCESS_SECRET=your_very_long_random_access_secret_here_at_least_32_chars
JWT_REFRESH_SECRET=your_very_long_random_refresh_secret_here_at_least_32_chars
JWT_ACCESS_TTL=7d
JWT_REFRESH_TTL=30d

# ===== Bootstrap =====
BOOTSTRAP_ADMIN_EMAIL=admin@yourcompany.com
BOOTSTRAP_ADMIN_PASSWORD=your_secure_password

# ===== DashScope (必填) =====
DASHSCOPE_API_KEY=your_dashscope_api_key
DASHSCOPE_LLM_MODEL=qwen-plus
DASHSCOPE_EMBED_MODEL=text-embedding-v4
DASHSCOPE_EMBED_DIM=1024

# ===== 生产配置 =====
CHUNK_SIZE=500
CHUNK_OVERLAP=50
SEARCH_BM25_TOPK=50
SEARCH_VECTOR_TOPK=50
SEARCH_RRF_K=60
SEARCH_RRF_FINAL_TOPK=10
```

### 3.4 使用 PM2 运行

```bash
# 安装 PM2
npm install -g pm2

# 启动后端
cd /opt/ai-knowledge/apps/api
pm2 start dist/main.js --name api -i 2  # 2 个实例

# 启动前端（静态服务）
cd /opt/ai-knowledge/apps/web
pm2 serve out 8888 --name web &
```

### 3.5 使用 Docker 运行

```bash
# 构建镜像
docker build -t ai-knowledge/api -f apps/api/Dockerfile .
docker build -t ai-knowledge/web -f apps/web/Dockerfile .

# 运行容器
docker run -d --name api \
  --env-file .env.production \
  --network ai-knowledge-network \
  -p 9999:9999 \
  ai-knowledge/api

docker run -d --name web \
  -p 8888:80 \
  ai-knowledge/web
```

---

## 4. Docker 部署

### 4.1 Docker Compose 配置

创建 `docker-compose.prod.yml`：

```yaml
version: '3.8'

services:
  # PostgreSQL + pgvector
  postgres:
    image: pgvector/pgvector:pg16
    container_name: postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ai_knowledge
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ai_knowledge
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./infra/docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ai_knowledge"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Neo4j
  neo4j:
    image: neo4j:5
    container_name: neo4j
    restart: unless-stopped
    environment:
      NEO4J_AUTH: neo4j/${NEO4J_PASSWORD}
      NEO4J_PLUGINS: '["apoc"]'
      NEO4J_dbms_memory_heap_initial__size: 512m
      NEO4J_dbms_memory_heap_max__size: 2g
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
      - ./infra/docker/neo4j/init.cypher:/init.cypher:ro
    ports:
      - "7474:7474"
      - "7687:7687"
    healthcheck:
      test: ["CMD", "neo4j", "status"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis
  redis:
    image: redis:7-alpine
    container_name: redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"

  # MinIO
  minio:
    image: minio/minio:latest
    container_name: minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${S3_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${S3_SECRET_KEY}
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"

  # Nginx Reverse Proxy
  nginx:
    image: nginx:alpine
    container_name: nginx
    restart: unless-stopped
    volumes:
      - ./infra/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./infra/nginx/conf.d:/etc/nginx/conf.d:ro
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - api
      - web

volumes:
  postgres_data:
  neo4j_data:
  neo4j_logs:
  redis_data:
  minio_data:

networks:
  default:
    name: ai-knowledge-network
```

### 4.2 启动 Docker 部署

```bash
# 复制生产配置
cp .env.example .env.production

# 编辑生产配置
nano .env.production

# 启动所有服务
docker compose -f docker-compose.prod.yml up -d

# 查看日志
docker compose -f docker-compose.prod.yml logs -f
```

### 4.3 初始化 MinIO Bucket

```bash
# 等待 MinIO 启动
sleep 10

# 创建 Bucket
docker exec minio mc alias set local http://localhost:9000 ${S3_ACCESS_KEY} ${S3_SECRET_KEY}
docker exec minio mc mb local/ai-knowledge-docs --ignore-existing
docker exec minio mc anonymous set download local/ai-knowledge-docs
```

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
  DATABASE_URL: "postgresql://user:password@postgres:5432/ai_knowledge"
  REDIS_URL: "redis://redis:6379"
  NEO4J_URI: "bolt://neo4j:7687"
  NEO4J_USER: "neo4j"
  NEO4J_PASSWORD: "neo4j_password"
  JWT_ACCESS_SECRET: "your_jwt_access_secret"
  JWT_REFRESH_SECRET: "your_jwt_refresh_secret"
  DASHSCOPE_API_KEY: "your_dashscope_key"
  S3_ACCESS_KEY: "minio_access_key"
  S3_SECRET_KEY: "minio_secret_key"
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

| 变量名 | 说明 | 默认值 | 必填 |
|--------|------|--------|------|
| `NODE_ENV` | 运行环境 | development | - |
| `API_PORT` | API 端口 | 9999 | - |
| `WEB_PORT` | 前端端口 | 8888 | - |
| `WEB_ORIGIN` | 前端地址（用于 CORS） | http://localhost:8888 | - |
| `DATABASE_URL` | PostgreSQL 连接地址 | - | 是 |
| `REDIS_URL` | Redis 连接地址 | - | 是 |
| `NEO4J_URI` | Neo4j Bolt 地址 | bolt://localhost:7687 | 是 |
| `NEO4J_USER` | Neo4j 用户名 | neo4j | 是 |
| `NEO4J_PASSWORD` | Neo4j 密码 | - | 是 |
| `S3_ENDPOINT` | MinIO 端点 | http://localhost:9000 | 是 |
| `S3_REGION` | 区域 | us-east-1 | - |
| `S3_BUCKET` | Bucket 名称 | ai-knowledge-docs | - |
| `S3_ACCESS_KEY` | S3 Access Key | - | 是 |
| `S3_SECRET_KEY` | S3 Secret Key | - | 是 |
| `JWT_ACCESS_SECRET` | Access Token 密钥 | - | 是 |
| `JWT_REFRESH_SECRET` | Refresh Token 密钥 | - | 是 |
| `JWT_ACCESS_TTL` | Access Token 有效期 | 7d | - |
| `JWT_REFRESH_TTL` | Refresh Token 有效期 | 30d | - |
| `BOOTSTRAP_ADMIN_EMAIL` | 初始管理员邮箱 | - | 是 |
| `BOOTSTRAP_ADMIN_PASSWORD` | 初始管理员密码 | - | 是 |
| `DASHSCOPE_API_KEY` | 通义千问 API Key | - | 是 |
| `DASHSCOPE_BASE_URL` | DashScope API 地址 | https://dashscope.aliyuncs.com/api/v1 | - |
| `DASHSCOPE_LLM_MODEL` | LLM 模型 | qwen-plus | - |
| `DASHSCOPE_EMBED_MODEL` | Embedding 模型 | text-embedding-v4 | - |
| `DASHSCOPE_EMBED_DIM` | Embedding 维度 | 1024 | - |
| `CHUNK_SIZE` | 切片大小 | 500 | - |
| `CHUNK_OVERLAP` | 切片重叠 | 50 | - |
| `SEARCH_BM25_TOPK` | BM25 召回数 | 50 | - |
| `SEARCH_VECTOR_TOPK` | 向量召回数 | 50 | - |
| `SEARCH_RRF_K` | RRF K 值 | 60 | - |
| `SEARCH_RRF_FINAL_TOPK` | 最终返回数 | 10 | - |

### 6.2 环境特定配置

#### 开发环境
```env
NODE_ENV=development
LOG_LEVEL=debug
CORS_ORIGIN=http://localhost:8888
```

#### 生产环境
```env
NODE_ENV=production
LOG_LEVEL=info
CORS_ORIGIN=https://your-domain.com
JWT_ACCESS_SECRET=<生成 64 位随机字符串>
JWT_REFRESH_SECRET=<生成 64 位随机字符串>
```

#### 测试环境
```env
NODE_ENV=test
DATABASE_URL=postgresql://ai_knowledge:test@localhost:5432/ai_knowledge_test
REDIS_URL=redis://localhost:6379/1
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

### 8.1 Nginx 配置

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
                    'rt=$request_time uct=$upstream_connect_time uht=$upstream_header_time urt=$upstream_response_time';

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

### 8.2 站点配置

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

### 8.3 SSL 证书 (Let's Encrypt)

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
docker compose ps postgres
docker compose logs postgres

# 测试连接
docker exec -it postgres psql -U ai_knowledge -d ai_knowledge -c "SELECT 1;"

# 检查网络
docker network inspect ai-knowledge-network
```

### Q: 文档处理队列不工作？

```bash
# 检查 Redis 连接
docker exec -it redis redis-cli ping

# 检查 BullMQ Dashboard
# 访问 Redis Insight 或使用 redis-cli
docker exec -it redis redis-cli

# 查看队列状态
KEYS bullmq:*
LLEN bullmq:documents:wait
```

### Q: 前端构建失败？

```bash
# 清理缓存
pnpm store prune
rm -rf node_modules/.cache

# 重新构建
pnpm --filter @ai-knowledge/web clean
pnpm --filter @ai-knowledge/web build
```

### Q: Neo4j 查询超时？

```bash
# 检查 Neo4j 日志
docker compose logs neo4j | grep -i error

# 调整超时配置
# 在 neo4j.conf 中添加：
dbms.transaction.timeout=120s
```

---

## 附录：快速命令参考

```bash
# 启动所有服务
docker compose up -d

# 停止所有服务
docker compose down

# 查看日志
docker compose logs -f

# 重启特定服务
docker compose restart [service-name]

# 进入容器
docker exec -it [container-name] bash

# 查看资源使用
docker stats

# 清理未使用的资源
docker system prune -f

# 重建特定服务
docker compose up -d --force-recreate [service-name]
```
