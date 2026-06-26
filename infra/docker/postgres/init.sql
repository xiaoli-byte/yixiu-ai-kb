-- ============================================================
-- ai-knowledge 数据库初始化脚本
-- 仅在数据库首次初始化时执行（/docker-entrypoint-initdb.d/）
-- 包含：扩展创建、完整表结构、索引、向量+全文检索配置
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

-- refresh_tokens 按 userId 和 tokenHash 索引
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_hash_idx ON refresh_tokens (token_hash);

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
  FOREACH t IN ARRAY ARRAY['users', 'documents', 'folders', 'qa_conversations']
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

-- 6) 迁移后标记（防止 docker-entrypoint 重复执行导致主键冲突）
CREATE TABLE IF NOT EXISTS "__prisma_migrations" (
  id                    VARCHAR(36)    PRIMARY KEY,
  checksum              VARCHAR(64)     NOT NULL,
  finished_at           TIMESTAMPTZ,
  migration_name        VARCHAR(255)    NOT NULL,
  logs                  TEXT,
  rolled_back_at        TIMESTAMPTZ,
  started_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  applied_steps_count   INT            NOT NULL DEFAULT 0
);

INSERT INTO "__prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
VALUES ('00000000-0000-0000-0000-000000000000', 'init.sql', NOW(), '0000_init', 1)
ON CONFLICT (id) DO NOTHING;

-- 完成
DO $$
BEGIN
  RAISE NOTICE 'Database schema initialized successfully.';
END
$$;
