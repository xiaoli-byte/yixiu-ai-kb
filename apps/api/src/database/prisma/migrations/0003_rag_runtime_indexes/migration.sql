-- Move the remaining RAG runtime-created indexes under Prisma Migrate control.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS structured_facts_attributes_idx
  ON structured_facts USING gin (attributes);

CREATE INDEX IF NOT EXISTS structured_facts_source_trgm_idx
  ON structured_facts USING gin (source_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS qa_run_logs_tenant_created_idx
  ON qa_run_logs (tenant_id, created_at DESC);
