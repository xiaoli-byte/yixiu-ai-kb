-- ============================================================
-- 中文分词迁移脚本 (v2 - 添加 zhparser 支持)
-- 适用于已有数据的数据库升级
-- ============================================================

-- 1. 添加 zhparser 扩展（需要管理员权限）
-- 如果 zhparser 未安装，需要先安装自定义 PostgreSQL 镜像
-- ALTER EXTENSION zhparser ADD EXTENSION IF NOT EXISTS zhparser;

-- 2. 创建中文分词配置
DO $$
BEGIN
    -- 创建 zhparser 的文本搜索配置（如果没有）
    IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'zhcfg') THEN
        CREATE TEXT SEARCH CONFIGURATION zhcfg (parser = zhparser);
        -- 添加中文基础词典映射
        ALTER TEXT SEARCH CONFIGURATION zhcfg ADD MAPPING FOR n,v,a,i,e,l,s,j,h WITH simple;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'zhparser not available or already exists: %', SQLERRM;
END
$$;

-- 3. 添加中文分词列
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS tsv_zh TSVECTOR;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS tsv_simple TSVECTOR;

-- 4. 创建索引（如果不存在）
CREATE INDEX IF NOT EXISTS chunks_tsv_zh_idx ON chunks USING GIN (tsv_zh);
CREATE INDEX IF NOT EXISTS chunks_tsv_simple_idx ON chunks USING GIN (tsv_simple);

-- 5. 删除旧的单一分词索引（可选，保留以兼容旧代码）
-- DROP INDEX IF EXISTS chunks_tsv_idx;

-- 6. 创建触发器函数（中文分词）
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

-- 7. 创建触发器函数（通用分词）
CREATE OR REPLACE FUNCTION chunks_set_tsv_simple() RETURNS trigger AS $$
BEGIN
    NEW.tsv_simple := to_tsvector('simple', lower(NEW.text));
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- 8. 创建触发器
DROP TRIGGER IF EXISTS chunks_tsv_zh_trigger ON chunks;
CREATE TRIGGER chunks_tsv_zh_trigger
BEFORE INSERT OR UPDATE OF text ON chunks
FOR EACH ROW EXECUTE FUNCTION chunks_set_tsv_zh();

DROP TRIGGER IF EXISTS chunks_tsv_simple_trigger ON chunks;
CREATE TRIGGER chunks_tsv_simple_trigger
BEFORE INSERT OR UPDATE OF text ON chunks
FOR EACH ROW EXECUTE FUNCTION chunks_set_tsv_simple();

-- 9. 为现有数据生成中文分词
UPDATE chunks SET tsv_zh = to_tsvector('zhcfg', text) WHERE tsv_zh IS NULL;
UPDATE chunks SET tsv_simple = to_tsvector('simple', lower(text)) WHERE tsv_simple IS NULL;

-- 10. 验证
SELECT 'chunks_tsv_zh_idx' AS index_name, EXISTS(SELECT 1 FROM pg_indexes WHERE indexname = 'chunks_tsv_zh_idx') AS exists;
SELECT 'chunks_tsv_simple_idx' AS index_name, EXISTS(SELECT 1 FROM pg_indexes WHERE indexname = 'chunks_tsv_simple_idx') AS exists;
