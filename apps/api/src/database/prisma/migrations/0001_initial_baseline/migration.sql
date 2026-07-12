-- Prisma baseline generated from infra/docker/postgres/init.sql.
-- Keep future PostgreSQL business structure changes in Prisma migrations, not docker init scripts.

-- ============================================================
-- ai-knowledge Prisma initial baseline
-- 包含：扩展创建、完整表结构、索引、向量+全文检索配置
-- 后续业务表结构变更必须继续新增 Prisma migration。
-- ============================================================

-- 1) 启用扩展
CREATE EXTENSION IF NOT EXISTS vector;              -- 向量检索（pgvector）
CREATE EXTENSION IF NOT EXISTS pg_trgm;            -- 模糊匹配（trigram）
CREATE EXTENSION IF NOT EXISTS pgcrypto;           -- 加密函数（用于 token hash）
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";         -- UUID 生成
CREATE EXTENSION IF NOT EXISTS zhparser;           -- 中文分词

-- 2) 中文全文检索配置
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_ts_config WHERE cfgname = 'zhcfg'
  ) THEN
    CREATE TEXT SEARCH CONFIGURATION zhcfg (parser = zhparser);
    ALTER TEXT SEARCH CONFIGURATION zhcfg
      ADD MAPPING FOR n, v, a, i, e, l, s, j, h, w WITH simple;
  END IF;
END
$$;

-- 3) 表结构

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(36)  NOT NULL,
  tenant_id     VARCHAR(36)  NOT NULL,
  email         VARCHAR(255) NOT NULL,
  name          VARCHAR(255) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(30)  NOT NULL DEFAULT 'viewer',
  department_id VARCHAR(36),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, email)
);

-- 部门表
CREATE TABLE IF NOT EXISTS departments (
  id         VARCHAR(36)  NOT NULL,
  tenant_id  VARCHAR(36)  NOT NULL,
  name       VARCHAR(255) NOT NULL,
  parent_id  VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

-- 文件夹表
CREATE TABLE IF NOT EXISTS folders (
  id         VARCHAR(36)  NOT NULL,
  tenant_id  VARCHAR(36)  NOT NULL,
  name       VARCHAR(255) NOT NULL,
  parent_id  VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, name, parent_id)
);

-- 文档表
CREATE TABLE IF NOT EXISTS documents (
  id             VARCHAR(36)  NOT NULL,
  tenant_id      VARCHAR(36)  NOT NULL,
  owner_id       VARCHAR(36)  NOT NULL,
  folder_id      VARCHAR(36),
  title          VARCHAR(500) NOT NULL,
  mime           VARCHAR(100) NOT NULL,
  size           BIGINT       NOT NULL DEFAULT 0,
  status         VARCHAR(30)  NOT NULL DEFAULT 'PENDING',
  storage_key    VARCHAR(1000),
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 文档块表（含向量 + 两种全文检索）
CREATE TABLE IF NOT EXISTS chunks (
  id          VARCHAR(36)    NOT NULL,
  document_id VARCHAR(36)    NOT NULL,
  idx         INT           NOT NULL,
  text        TEXT          NOT NULL,
  tokens      INT           NOT NULL DEFAULT 0,
  page        INT,                          -- PDF 页码（1-based）
  embedding   vector(1024)  NOT NULL,       -- DashScope text-embedding-v4 dim=1024
  tsv_zh      TSVECTOR,                     -- 中文全文检索（zhparser）
  tsv_simple  TSVECTOR,                     -- 英文/通用全文检索（simple）
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- 结构化事实表（跨行业 RAG 控制层使用）
CREATE TABLE IF NOT EXISTS structured_facts (
  id            VARCHAR(36)  NOT NULL,
  tenant_id     VARCHAR(36)  NOT NULL,
  document_id   VARCHAR(36)  NOT NULL,
  chunk_id      VARCHAR(36),
  domain        VARCHAR(50)  NOT NULL,
  entity_type   VARCHAR(80)  NOT NULL,
  entity_name   VARCHAR(500) NOT NULL,
  attributes    JSONB        NOT NULL DEFAULT '{}'::jsonb,
  confidence    DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  source_text   TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE SET NULL
);

-- 标签表
CREATE TABLE IF NOT EXISTS tags (
  id   VARCHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(30)  NOT NULL DEFAULT 'MANUAL',
  PRIMARY KEY (id),
  UNIQUE (name, type)
);

-- 文档-标签关联表
CREATE TABLE IF NOT EXISTS document_tags (
  document_id VARCHAR(36) NOT NULL,
  tag_id      VARCHAR(36) NOT NULL,
  PRIMARY KEY (document_id, tag_id),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)      REFERENCES tags(id)      ON DELETE CASCADE
);

-- QA 对话表
CREATE TABLE IF NOT EXISTS qa_conversations (
  id         VARCHAR(36)  NOT NULL,
  user_id    VARCHAR(36)  NOT NULL,
  tenant_id  VARCHAR(36)  NOT NULL,
  title      VARCHAR(500) NOT NULL DEFAULT '新会话',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- QA 消息表
CREATE TABLE IF NOT EXISTS qa_messages (
  id             VARCHAR(36)  NOT NULL,
  conversation_id VARCHAR(36)  NOT NULL,
  role           VARCHAR(30)  NOT NULL,
  content        TEXT         NOT NULL,
  citations      JSONB,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  FOREIGN KEY (conversation_id) REFERENCES qa_conversations(id) ON DELETE CASCADE
);

-- QA 运行日志：记录路由、事实、chunk、工具结果和错误，支持评测闭环
CREATE TABLE IF NOT EXISTS qa_run_logs (
  id              VARCHAR(36) NOT NULL,
  tenant_id       VARCHAR(36) NOT NULL,
  user_id         VARCHAR(36),
  conversation_id VARCHAR(36),
  question        TEXT        NOT NULL,
  rewritten_query TEXT,
  intent          VARCHAR(50) NOT NULL,
  domain          VARCHAR(50) NOT NULL,
  facts           JSONB       NOT NULL DEFAULT '[]'::jsonb,
  chunks          JSONB       NOT NULL DEFAULT '[]'::jsonb,
  tool_result     JSONB,
  answer          TEXT,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  FOREIGN KEY (conversation_id) REFERENCES qa_conversations(id) ON DELETE SET NULL
);

-- Refresh Token 表
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         VARCHAR(36)  NOT NULL,
  user_id    VARCHAR(36)  NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ  NOT NULL,
  revoked    BOOLEAN      NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4) 索引

-- chunks 向量检索（HNSW，推荐用于生产）
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);

-- chunks 向量检索（IVFFlat，备选）
CREATE INDEX IF NOT EXISTS chunks_embedding_ivfflat_idx
  ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- chunks 中文全文检索
CREATE INDEX IF NOT EXISTS chunks_tsv_zh_idx ON chunks USING gin (tsv_zh);

-- chunks 英文/通用全文检索
CREATE INDEX IF NOT EXISTS chunks_tsv_simple_idx ON chunks USING gin (tsv_simple);

-- structured_facts 查询索引
CREATE INDEX IF NOT EXISTS structured_facts_tenant_domain_idx
  ON structured_facts (tenant_id, domain, entity_type);
CREATE INDEX IF NOT EXISTS structured_facts_document_idx
  ON structured_facts (document_id);
CREATE INDEX IF NOT EXISTS structured_facts_attributes_idx
  ON structured_facts USING gin (attributes);
CREATE INDEX IF NOT EXISTS structured_facts_source_trgm_idx
  ON structured_facts USING gin (source_text gin_trgm_ops);

-- documents 按租户 + 状态索引（文档列表常用）
CREATE INDEX IF NOT EXISTS documents_tenant_status_idx ON documents (tenant_id, status);

-- documents 按 owner 索引（我的文档）
CREATE INDEX IF NOT EXISTS documents_owner_idx ON documents (owner_id);

-- qa_conversations 按用户 + 更新时间索引
CREATE INDEX IF NOT EXISTS qa_conv_user_updated_idx
  ON qa_conversations (user_id, updated_at DESC);

-- qa_messages 按对话索引（消息历史）
CREATE INDEX IF NOT EXISTS qa_messages_conv_created_idx
  ON qa_messages (conversation_id, created_at);

-- qa_run_logs 按租户 + 时间索引
CREATE INDEX IF NOT EXISTS qa_run_logs_tenant_created_idx
  ON qa_run_logs (tenant_id, created_at DESC);

-- refresh_tokens 按 userId 和 tokenHash 索引
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_hash_idx ON refresh_tokens (token_hash);

-- 4.1) Canonical 文档内容与图谱去重表
CREATE TABLE IF NOT EXISTS document_contents (
  id                    VARCHAR(36)  NOT NULL,
  tenant_id             VARCHAR(36)  NOT NULL,
  content_hash          VARCHAR(64)  NOT NULL,
  first_file_hash       VARCHAR(64),
  title                 VARCHAR(500) NOT NULL,
  mime                  VARCHAR(100) NOT NULL,
  size                  BIGINT       NOT NULL DEFAULT 0,
  status                VARCHAR(30)  NOT NULL DEFAULT 'PENDING',
  storage_key           VARCHAR(1000),
  canonical_document_id VARCHAR(36),
  chunk_count           INT          NOT NULL DEFAULT 0,
  duplicate_count       INT          NOT NULL DEFAULT 1,
  source_count          INT          NOT NULL DEFAULT 1,
  error_message         TEXT,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, content_hash)
);

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS content_id VARCHAR(36),
  ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS duplicate_of_document_id VARCHAR(36),
  ADD COLUMN IF NOT EXISTS dedup_reason VARCHAR(30);

ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS content_id VARCHAR(36),
  ADD COLUMN IF NOT EXISTS chunk_hash VARCHAR(64);

ALTER TABLE structured_facts
  ADD COLUMN IF NOT EXISTS content_id VARCHAR(36),
  ADD COLUMN IF NOT EXISTS fact_hash VARCHAR(64);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'documents_content_id_fkey' AND table_name = 'documents'
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_content_id_fkey
      FOREIGN KEY (content_id) REFERENCES document_contents(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chunks_content_id_fkey' AND table_name = 'chunks'
  ) THEN
    ALTER TABLE chunks
      ADD CONSTRAINT chunks_content_id_fkey
      FOREIGN KEY (content_id) REFERENCES document_contents(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'structured_facts_content_id_fkey' AND table_name = 'structured_facts'
  ) THEN
    ALTER TABLE structured_facts
      ADD CONSTRAINT structured_facts_content_id_fkey
      FOREIGN KEY (content_id) REFERENCES document_contents(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id            VARCHAR(80)  NOT NULL,
  tenant_id     VARCHAR(36)  NOT NULL,
  canonical_key VARCHAR(700) NOT NULL,
  name          VARCHAR(500) NOT NULL,
  type          VARCHAR(80)  NOT NULL DEFAULT 'Concept',
  aliases       JSONB        NOT NULL DEFAULT '[]'::jsonb,
  source_count  INT          NOT NULL DEFAULT 0,
  mention_count INT          NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, canonical_key)
);

CREATE TABLE IF NOT EXISTS knowledge_edges (
  id              VARCHAR(80)   NOT NULL,
  tenant_id       VARCHAR(36)   NOT NULL,
  source_node_id  VARCHAR(80)   NOT NULL,
  target_node_id  VARCHAR(80)   NOT NULL,
  relation_type   VARCHAR(120)  NOT NULL DEFAULT 'RELATED',
  edge_key        VARCHAR(1600) NOT NULL,
  weight          INT           NOT NULL DEFAULT 1,
  evidence_count  INT           NOT NULL DEFAULT 0,
  source_count    INT           NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, edge_key),
  FOREIGN KEY (source_node_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_node_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS edge_evidences (
  id                  VARCHAR(36) NOT NULL,
  tenant_id           VARCHAR(36) NOT NULL,
  edge_id             VARCHAR(80) NOT NULL,
  document_content_id VARCHAR(36) NOT NULL,
  document_id         VARCHAR(36),
  chunk_id            VARCHAR(36),
  evidence_hash       VARCHAR(64) NOT NULL,
  evidence_text       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  FOREIGN KEY (edge_id) REFERENCES knowledge_edges(id) ON DELETE CASCADE,
  FOREIGN KEY (document_content_id) REFERENCES document_contents(id) ON DELETE CASCADE,
  FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS documents_tenant_file_hash_idx ON documents (tenant_id, file_hash);
CREATE INDEX IF NOT EXISTS documents_tenant_content_hash_idx ON documents (tenant_id, content_hash);
CREATE INDEX IF NOT EXISTS documents_content_idx ON documents (content_id);
CREATE INDEX IF NOT EXISTS document_contents_tenant_status_idx ON document_contents (tenant_id, status);
CREATE INDEX IF NOT EXISTS chunks_content_idx ON chunks (content_id, idx);
CREATE INDEX IF NOT EXISTS chunks_chunk_hash_idx ON chunks (chunk_hash);
CREATE UNIQUE INDEX IF NOT EXISTS chunks_content_idx_unique
  ON chunks (content_id, idx)
  WHERE content_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS structured_facts_content_idx ON structured_facts (content_id);
CREATE INDEX IF NOT EXISTS structured_facts_fact_hash_idx ON structured_facts (fact_hash);
CREATE UNIQUE INDEX IF NOT EXISTS structured_facts_content_fact_unique
  ON structured_facts (tenant_id, content_id, fact_hash)
  WHERE content_id IS NOT NULL AND fact_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS knowledge_nodes_tenant_type_idx ON knowledge_nodes (tenant_id, type);
CREATE INDEX IF NOT EXISTS knowledge_edges_tenant_relation_idx ON knowledge_edges (tenant_id, relation_type);
CREATE INDEX IF NOT EXISTS edge_evidences_edge_content_idx ON edge_evidences (edge_id, document_content_id);
CREATE INDEX IF NOT EXISTS edge_evidences_tenant_content_idx ON edge_evidences (tenant_id, document_content_id);
CREATE UNIQUE INDEX IF NOT EXISTS edge_evidences_unique_source_idx
  ON edge_evidences (edge_id, document_content_id, COALESCE(chunk_id, ''), evidence_hash);

-- 5) updated_at 自动更新触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为有 updated_at 字段的表创建触发器（已有数据时不重建，只新建）
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'documents', 'folders', 'qa_conversations', 'document_contents', 'knowledge_nodes', 'knowledge_edges']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'update_' || t || '_updated_at'
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %s
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
        t, t
      );
    END IF;
  END LOOP;
END;
$$;

