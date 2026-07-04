# 企业级知识库 MVP

> 基于 **NestJS + Next.js + Neo4j + 通义千问** 的企业级知识库，覆盖文档管理、混合检索、AI 问答、知识图谱四大核心场景。

## ✨ 核心能力

- **📁 文档管理** - PDF / Markdown / Office / TXT / 图片 / 音视频上传，自动解析、OCR 或 ASR 转写 → 切片 → 向量化 → 实体抽取，状态可视化
- **🔍 混合检索** - 关键词 (PostgreSQL 全文) + 向量 (pgvector HNSW) 双路召回，RRF 智能融合
- **💬 AI 问答 (RAG)** - 基于通义千问 `qwen-plus` 的检索增强问答，支持流式响应与引用高亮
- **🕸 知识图谱** - Neo4j 存储文档 / 实体 / 关系，2D 力导向图可视化探索
- **🔐 鉴权** - JWT 双 token + 多租户 (CLS 注入 tenantId)
- **🎨 现代 UI** - Next.js 15 App Router + Tailwind + shadcn 风格 + Lucide Icons

## 🧱 技术栈

| 层次 | 选型 |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| 后端 | NestJS 10 + Prisma + BullMQ |
| 前端 | Next.js 15 (App Router) + Tailwind + Zustand |
| 业务 + 向量库 | PostgreSQL 16 + pgvector (HNSW) |
| 缓存 / 队列 | Redis 7 + BullMQ |
| 对象存储 | MinIO (S3 协议) |
| 图数据库 | Neo4j 5.x (APOC) |
| AI | DashScope: `qwen-plus` + `text-embedding-v4` (1024 维) |
| 多模态解析 | FunASR HTTP 服务（音频/音视频转写）+ PaddleOCR（图片与扫描 PDF） |
| 鉴权 | JWT + Passport + CLS 租户上下文 |

## 🚀 快速开始

### 1. 前置环境
- Node.js ≥ 20
- pnpm ≥ 9 (`npm i -g pnpm@9`)
- Docker Desktop
- 通义千问 DashScope API Key（[申请](https://dashscope.console.aliyun.com/)）
- Python 3.11（PaddleOCR 本地推理需要，通过 `py -3.11` 可用）

### 2. 启动依赖

```bash
cp .env.example .env
# 编辑 .env：填入 DASHSCOPE_API_KEY

docker compose up -d
# 等待 Postgres / Neo4j / Redis / MinIO 就绪

# 单独启动 PaddleOCR 本地服务（首次运行会创建 venv 并安装依赖）
.\services\paddleocr-server\start.ps1
# 首次 OCR 请求会下载模型，耗时会比其他依赖更长
```

### 3. 安装 + 初始化

```bash
pnpm install
pnpm --filter @ai-knowledge/api prisma:generate
pnpm --filter @ai-knowledge/api prisma:push
pnpm seed                  # 写入演示用户与文档
```

### 4. 启动开发环境

```bash
pnpm dev
```

开发模式会同时启动 Web、API 和文档处理 worker。上传接口只负责入队，解析、OCR/ASR、切片和向量化由 worker 消费，避免大文件处理时挤占 API 请求。

如需只启动 Web/API、不启动 worker，可使用旧的 Turbo 启动方式：

```bash
pnpm dev:turbo
```

| 服务 | 地址 |
|---|---|
| 前端 Web | http://localhost:8888 |
| 后端 API | http://localhost:9999/api |
| 健康检查 | http://localhost:9999/health |
| MinIO 控制台 | http://localhost:9001 (minio_admin / minio_password) |
| PaddleOCR | http://localhost:10096/health |
| Neo4j 浏览器 | http://localhost:7474 (neo4j / neo4j_dev_password) |
| Postgres | localhost:5432 (ai_knowledge / dev_password) |

### 5. 一键脚本

```bash
bash infra/scripts/bootstrap.sh   # 等价于以上 1-3 步
```

## 🔑 演示账号

```
邮箱：admin@demo.com
密码：demo123
角色：super_admin
租户：tenant_demo
```

## 📚 演示路径

1. **登录** → 进入 Dashboard
2. **文档管理** - 上传 1-2 份 Markdown / PDF，等待状态变为「就绪」
3. **智能检索** - 输入关键词，切换「关键词 / 语义 / 混合」三种模式
4. **AI 问答** - 基于上传的文档提问，查看引用卡片
5. **知识图谱** - 探索从文档中抽取的实体关系

## 📂 目录结构

```
.
├── apps/
│   ├── api/         # NestJS 后端（端口 9999）
│   └── web/         # Next.js 前端（端口 8888）
├── packages/
│   ├── schemas/     # Zod schemas（前后端共享类型）
│   └── config/      # 共享 tsconfig
├── infra/
│   ├── docker/      # Postgres init / Neo4j constraints / MinIO 脚本
│   └── scripts/     # bootstrap 一键启动
├── docker-compose.yml
├── pnpm-workspace.yaml
├── turbo.json
└── .env.example
```

## 🛠 API 速览

所有接口需要 `Authorization: Bearer <accessToken>`

| 模块 | 方法 | 路径 | 说明 |
|---|---|---|---|
| 鉴权 | POST | `/auth/login` | 登录获取双 token |
| 鉴权 | POST | `/auth/refresh` | 刷新 accessToken |
| 鉴权 | GET | `/auth/me` | 当前用户 |
| 文档 | GET | `/documents?q=&status=&page=&pageSize=` | 列表 |
| 文档 | GET | `/documents/:id` | 详情（含 chunks） |
| 文档 | POST | `/documents/upload` | multipart 上传 |
| 文档 | DELETE | `/documents/:id` | 删除 |
| 检索 | POST | `/search` | `{q, mode: hybrid/semantic/keyword, topK}` |
| 问答 | POST | `/qa/ask` | SSE 流式问答 |
| 问答 | GET | `/qa/conversations` | 会话列表 |
| 问答 | GET | `/qa/conversations/:id` | 会话详情 |
| 图谱 | GET | `/graph/search?keyword=&type=&depth=&limit=` | 子图查询 |
| 图谱 | GET | `/graph/top?limit=` | 高频实体 |
| 图谱 | GET | `/graph/document/:id` | 文档关联实体 |

## 🧩 关键流程

### 文档入库
```
Upload (multipart) 
  → MinIO putObject
  → DB insert (status=PENDING)
  → BullMQ enqueue
  → Worker: PARSING → CHUNKING → EMBEDDING → READY
     ├── pgvector embedding
     └── Neo4j 节点 + 实体抽取
```

### AI 问答
```
User question
  → hybridSearch(topK=5)  [BM25 + 向量 + RRF]
  → 拼装 prompt [context with [1][2] markers]
  → qwen-plus streamChat (SSE)
  → 保存消息 + citations
```

## ⚙️ 环境变量

参见 `.env.example`，关键项：
- `DASHSCOPE_API_KEY` - 千问密钥（**必填**）
- `DASHSCOPE_LLM_MODEL` - 默认 `qwen-plus`
- `DASHSCOPE_EMBED_MODEL` - 默认 `text-embedding-v4`
- `FUNASR_HTTP_URL` - FunASR HTTP 服务地址，默认 `http://localhost:10095`
- `PADDLEOCR_HTTP_URL` - PaddleOCR HTTP 识别接口，默认 `http://localhost:10096/ocr`
- `PADDLEOCR_LANG` - PaddleOCR 语言，默认 `ch`
- `PADDLEOCR_TIMEOUT_MS` - PaddleOCR 调用超时，默认 `600000`
- `OCR_PDF_RENDER_SCALE` - 扫描 PDF 转图片 OCR 的渲染倍率，默认 `2`
- `OCR_PDF_MAX_PAGES` - 扫描 PDF 最大 OCR 页数，`0` 表示不限制
- `DASHSCOPE_EMBED_DIM` - 默认 `1024`
- `BOOTSTRAP_ADMIN_*` - 启动管理员
- `CHUNK_SIZE` / `CHUNK_OVERLAP` - 切片参数
- `SEARCH_*` - 检索参数

> **未配置 DashScope 时**：`DASHSCOPE_LLM_MOCK=true` 启用 mock 模式，仅用于联调。

## 📖 文档

详细文档请参考 `docs/` 目录：

| 文档 | 说明 |
|------|------|
| [docs/USAGE.md](docs/USAGE.md) | 详细使用手册 |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | 部署指南 |
| [docs/TODO.md](docs/TODO.md) | 待办事项与路线图 |

## 🚧 后续迭代

详细规划见 [docs/TODO.md](docs/TODO.md)。

### P0 - 核心功能

- [ ] 知识图谱 3D 可视化
- [ ] 图谱节点筛选与搜索定位
- [ ] 图谱节点编辑（增删改）
- [ ] 图谱路径查询
- [ ] 问答满意度评价
- [ ] 多轮对话

### P1 - 重要功能

- [ ] 文档协同（评论、版本管理、共享）
- [ ] 完整 RBAC + 数据行级权限
- [ ] 操作审计日志
- [ ] LDAP/SSO 集成
- [ ] 外部数据源（飞书 / Notion / Confluence）

### P2 - 增强功能

- [ ] 多模型支持（OpenAI / Claude / 本地模型）
- [ ] 视频摘要与关键帧理解
- [ ] Prometheus + Grafana 监控
- [ ] Kubernetes 部署

## 🤝 贡献

欢迎提交 Pull Request！请确保：

1. 代码符合项目现有风格
2. 新功能包含单元测试
3. 更新相关文档

## 📄 License

MIT
