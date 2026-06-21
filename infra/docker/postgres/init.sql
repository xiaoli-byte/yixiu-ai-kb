-- ============================================================
-- AI Knowledge Base - PostgreSQL 初始化脚本
-- 支持: pgvector + zhparser 中文分词
-- ============================================================

-- 启用扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- zhparser 中文分词（需要自定义镜像）
CREATE EXTENSION IF NOT EXISTS zhparser;
COMMENT ON EXTENSION zhparser IS 'Chinese text parser based on lexical analysis';

-- 创建中文分词配置
DO $$
BEGIN
    -- 创建 zhparser 的文本搜索配置（如果没有）
    IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'zhcfg') THEN
        CREATE TEXT SEARCH CONFIGURATION zhcfg (parser = zhparser);
        -- 添加中文基础词典映射
        ALTER TEXT SEARCH CONFIGURATION zhcfg ADD MAPPING FOR n,v,a,i,e,l,s,j,h WITH simple;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- zhparser 可能未安装，静默跳过
    RAISE NOTICE 'zhparser not available, skipping zhcfg setup: %', SQLERRM;
END
$$;

-- ============================================================
-- 业务表
-- ============================================================

-- 用户表
CREATE TABLE IF NOT EXISTS "users" (
  "id"            TEXT PRIMARY KEY,
  "tenant_id"     TEXT NOT NULL,
  "email"         TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role"          TEXT NOT NULL DEFAULT 'viewer',
  "department_id" TEXT,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("tenant_id", "email")
);

-- 部门表
CREATE TABLE IF NOT EXISTS "departments" (
  "id"         TEXT PRIMARY KEY,
  "tenant_id"  TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "parent_id"  TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 文件夹表
CREATE TABLE IF NOT EXISTS "folders" (
  "id"         TEXT PRIMARY KEY,
  "tenant_id"  TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "parent_id"  TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("tenant_id", "name", "parent_id")
);

-- 文档表
CREATE TABLE IF NOT EXISTS "documents" (
  "id"           TEXT PRIMARY KEY,
  "tenant_id"    TEXT NOT NULL,
  "owner_id"     TEXT NOT NULL,
  "folder_id"    TEXT,
  "title"        TEXT NOT NULL,
  "mime"         TEXT NOT NULL,
  "size"         BIGINT NOT NULL DEFAULT 0,
  "status"       TEXT NOT NULL DEFAULT 'PENDING',
  "storage_key"  TEXT NOT NULL,
  "error_message" TEXT,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "documents_tenant_idx" ON "documents"("tenant_id");
CREATE INDEX IF NOT EXISTS "documents_status_idx" ON "documents"("status");
CREATE INDEX IF NOT EXISTS "documents_title_trgm" ON "documents" USING GIN ("title" gin_trgm_ops);

-- chunks 表（核心检索表）
CREATE TABLE IF NOT EXISTS "chunks" (
  "id"          TEXT PRIMARY KEY,
  "document_id" TEXT NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "idx"         INTEGER NOT NULL,
  "text"        TEXT NOT NULL,
  "tokens"      INTEGER NOT NULL DEFAULT 0,
  "page"        INTEGER,                    -- PDF 页码（1-based）
  "embedding"   VECTOR(1024),               -- 向量嵌入
  "tsv_zh"      TSVECTOR,                   -- 中文全文检索（zhparser）
  "tsv_simple"  TSVECTOR,                   -- 英文/通用全文检索
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "chunks_document_idx_idx" ON "chunks"("document_id", "idx");
CREATE INDEX IF NOT EXISTS "chunks_tsv_zh_idx" ON "chunks" USING GIN ("tsv_zh");
CREATE INDEX IF NOT EXISTS "chunks_tsv_simple_idx" ON "chunks" USING GIN ("tsv_simple");
-- Trigram 索引：支持 pg_trgm 模糊匹配（中文友好，基于字符 n-gram）
CREATE INDEX IF NOT EXISTS "chunks_text_trgm" ON "chunks" USING GIN ("text" gin_trgm_ops);
-- 1024 维 HNSW 向量索引（cosine）
CREATE INDEX IF NOT EXISTS "chunks_embedding_hnsw" ON "chunks"
  USING HNSW ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ============================================================
-- 触发器函数（双分词器）
-- ============================================================

-- 中文分词触发器（使用 zhparser）
CREATE OR REPLACE FUNCTION chunks_set_tsv_zh() RETURNS trigger AS $$
BEGIN
    -- 中文分词：使用 zhparser + zhcfg 配置
    NEW.tsv_zh := to_tsvector('zhcfg', NEW.text);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- 如果 zhparser 不可用，静默失败
    RAISE NOTICE 'zhparser trigger failed: %', SQLERRM;
    NEW.tsv_zh := NULL;
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- 英文/通用分词触发器（使用 simple 配置）
CREATE OR REPLACE FUNCTION chunks_set_tsv_simple() RETURNS trigger AS $$
BEGIN
    NEW.tsv_simple := to_tsvector('simple', lower(NEW.text));
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- 为新表创建触发器
DROP TRIGGER IF EXISTS chunks_tsv_zh_trigger ON "chunks";
CREATE TRIGGER chunks_tsv_zh_trigger
BEFORE INSERT OR UPDATE OF text ON "chunks"
FOR EACH ROW EXECUTE FUNCTION chunks_set_tsv_zh();

DROP TRIGGER IF EXISTS chunks_tsv_simple_trigger ON "chunks";
CREATE TRIGGER chunks_tsv_simple_trigger
BEFORE INSERT OR UPDATE OF text ON "chunks"
FOR EACH ROW EXECUTE FUNCTION chunks_set_tsv_simple();

-- ============================================================
-- 标签相关表
-- ============================================================

CREATE TABLE IF NOT EXISTS "tags" (
  "id"   TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'MANUAL',
  UNIQUE("name", "type")
);

CREATE TABLE IF NOT EXISTS "document_tags" (
  "document_id" TEXT NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "tag_id"      TEXT NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  PRIMARY KEY ("document_id", "tag_id")
);

-- ============================================================
-- 问答相关表
-- ============================================================

CREATE TABLE IF NOT EXISTS "qa_conversations" (
  "id"         TEXT PRIMARY KEY,
  "user_id"    TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tenant_id"  TEXT NOT NULL,
  "title"      TEXT NOT NULL DEFAULT '新会话',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "qa_conv_user_idx" ON "qa_conversations"("user_id", "updated_at" DESC);

CREATE TABLE IF NOT EXISTS "qa_messages" (
  "id"              TEXT PRIMARY KEY,
  "conversation_id" TEXT NOT NULL REFERENCES "qa_conversations"("id") ON DELETE CASCADE,
  "role"            TEXT NOT NULL,
  "content"         TEXT NOT NULL,
  "citations"       JSONB,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "qa_msg_conv_idx" ON "qa_messages"("conversation_id", "created_at");

-- ============================================================
-- Token 管理表
-- ============================================================

CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id"         TEXT PRIMARY KEY,
  "user_id"    TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "revoked"    BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_idx" ON "refresh_tokens"("user_id");
CREATE INDEX IF NOT EXISTS "refresh_tokens_hash_idx" ON "refresh_tokens"("token_hash");

-- ============================================================
-- 向量相似度函数（备用）
-- ============================================================

-- 计算余弦相似度（备用，如果 pgvector 不支持 <=> 操作符）
-- CREATE OR REPLACE FUNCTION cosine_similarity(a vector, b vector) RETURNS float AS $$
-- SELECT 1 - (a <=> b);
-- $$ LANGUAGE SQL IMMUTABLE PARALLEL SAFE;
