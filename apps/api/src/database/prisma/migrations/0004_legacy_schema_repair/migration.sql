-- Repair legacy development databases that were initialized from older init.sql baselines
-- before the current Prisma migrations became the source of truth.
--
-- This migration is intentionally additive and idempotent: it backfills the columns that the
-- current application expects while leaving legacy columns in place so existing data survives.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Documents: current deduplication fields.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS duplicate_of_document_id VARCHAR(36),
  ADD COLUMN IF NOT EXISTS dedup_reason VARCHAR(30);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name = 'original_document_id'
  ) THEN
    EXECUTE $repair$
      UPDATE documents
      SET duplicate_of_document_id = original_document_id,
          dedup_reason = COALESCE(dedup_reason, 'LEGACY')
      WHERE duplicate_of_document_id IS NULL
        AND original_document_id IS NOT NULL
    $repair$;
  END IF;
END $$;

-- Document content: current canonical content fields.
ALTER TABLE document_contents
  ADD COLUMN IF NOT EXISTS first_file_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS title VARCHAR(500),
  ADD COLUMN IF NOT EXISTS mime VARCHAR(100),
  ADD COLUMN IF NOT EXISTS size BIGINT,
  ADD COLUMN IF NOT EXISTS status VARCHAR(30),
  ADD COLUMN IF NOT EXISTS storage_key VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS canonical_document_id VARCHAR(36),
  ADD COLUMN IF NOT EXISTS duplicate_count INT,
  ADD COLUMN IF NOT EXISTS source_count INT,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

UPDATE document_contents dc
SET title = COALESCE(NULLIF(dc.title, ''), d.title),
    mime = COALESCE(NULLIF(dc.mime, ''), d.mime),
    size = COALESCE(dc.size, d.size, 0),
    storage_key = COALESCE(dc.storage_key, d.storage_key),
    canonical_document_id = COALESCE(dc.canonical_document_id, d.id),
    first_file_hash = COALESCE(dc.first_file_hash, d.file_hash),
    status = COALESCE(NULLIF(dc.status, ''), d.status, 'PENDING')
FROM documents d
WHERE d.content_id = dc.id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'document_contents'
      AND column_name = 'first_doc_id'
  ) THEN
    EXECUTE $repair$
      UPDATE document_contents dc
      SET canonical_document_id = COALESCE(dc.canonical_document_id, dc.first_doc_id),
          title = COALESCE(NULLIF(dc.title, ''), d.title),
          mime = COALESCE(NULLIF(dc.mime, ''), d.mime),
          size = COALESCE(dc.size, d.size, 0),
          storage_key = COALESCE(dc.storage_key, d.storage_key),
          first_file_hash = COALESCE(dc.first_file_hash, d.file_hash)
      FROM documents d
      WHERE d.id = dc.first_doc_id
    $repair$;

    EXECUTE $repair$
      ALTER TABLE document_contents
        ALTER COLUMN first_doc_id DROP NOT NULL
    $repair$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'document_contents'
      AND column_name = 'parse_status'
  ) THEN
    EXECUTE $repair$
      UPDATE document_contents
      SET status = COALESCE(NULLIF(status, ''), NULLIF(parse_status, ''), 'PENDING')
    $repair$;

    EXECUTE $repair$
      ALTER TABLE document_contents
        ALTER COLUMN parse_status SET DEFAULT 'PENDING'
    $repair$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'document_contents'
      AND column_name = 'text_length'
  ) THEN
    EXECUTE $repair$
      ALTER TABLE document_contents
        ALTER COLUMN text_length SET DEFAULT 0
    $repair$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'document_contents'
      AND column_name = 'attributes'
  ) THEN
    EXECUTE $repair$
      ALTER TABLE document_contents
        ALTER COLUMN attributes SET DEFAULT '{}'::jsonb
    $repair$;
  END IF;
END $$;

UPDATE document_contents dc
SET title = COALESCE(NULLIF(title, ''), content_hash, id),
    mime = COALESCE(NULLIF(mime, ''), 'application/octet-stream'),
    size = COALESCE(size, 0),
    status = COALESCE(NULLIF(status, ''), 'PENDING'),
    chunk_count = COALESCE(chunk_count, 0),
    duplicate_count = COALESCE(duplicate_count, stats.upload_count, 1),
    source_count = COALESCE(source_count, stats.upload_count, 1),
    updated_at = COALESCE(updated_at, NOW())
FROM (
  SELECT content_id, COUNT(*)::int AS upload_count
  FROM documents
  WHERE content_id IS NOT NULL
  GROUP BY content_id
) stats
WHERE stats.content_id = dc.id;

UPDATE document_contents
SET title = COALESCE(NULLIF(title, ''), content_hash, id),
    mime = COALESCE(NULLIF(mime, ''), 'application/octet-stream'),
    size = COALESCE(size, 0),
    status = COALESCE(NULLIF(status, ''), 'PENDING'),
    chunk_count = COALESCE(chunk_count, 0),
    duplicate_count = COALESCE(duplicate_count, 1),
    source_count = COALESCE(source_count, 1),
    updated_at = COALESCE(updated_at, NOW());

ALTER TABLE document_contents
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN mime SET NOT NULL,
  ALTER COLUMN size SET NOT NULL,
  ALTER COLUMN size SET DEFAULT 0,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'PENDING',
  ALTER COLUMN duplicate_count SET NOT NULL,
  ALTER COLUMN duplicate_count SET DEFAULT 1,
  ALTER COLUMN source_count SET NOT NULL,
  ALTER COLUMN source_count SET DEFAULT 1;

-- Knowledge graph relational mirror: add current names while keeping old columns.
ALTER TABLE knowledge_nodes
  ADD COLUMN IF NOT EXISTS type VARCHAR(80),
  ADD COLUMN IF NOT EXISTS aliases JSONB,
  ADD COLUMN IF NOT EXISTS mention_count INT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'knowledge_nodes'
      AND column_name = 'node_type'
  ) THEN
    EXECUTE $repair$
      UPDATE knowledge_nodes
      SET type = COALESCE(NULLIF(type, ''), NULLIF(node_type, ''), 'Concept')
    $repair$;

    EXECUTE $repair$
      ALTER TABLE knowledge_nodes
        ALTER COLUMN node_type SET DEFAULT 'Concept'
    $repair$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'knowledge_nodes'
      AND column_name = 'weight'
  ) THEN
    EXECUTE $repair$
      ALTER TABLE knowledge_nodes
        ALTER COLUMN weight SET DEFAULT 1
    $repair$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'knowledge_nodes'
      AND column_name = 'duplicate_count'
  ) THEN
    EXECUTE $repair$
      ALTER TABLE knowledge_nodes
        ALTER COLUMN duplicate_count SET DEFAULT 1
    $repair$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'knowledge_nodes'
      AND column_name = 'attributes'
  ) THEN
    EXECUTE $repair$
      ALTER TABLE knowledge_nodes
        ALTER COLUMN attributes SET DEFAULT '{}'::jsonb
    $repair$;
  END IF;
END $$;

UPDATE knowledge_nodes
SET type = COALESCE(NULLIF(type, ''), 'Concept'),
    aliases = COALESCE(aliases, '[]'::jsonb),
    mention_count = COALESCE(mention_count, 0);

ALTER TABLE knowledge_nodes
  ALTER COLUMN type SET NOT NULL,
  ALTER COLUMN type SET DEFAULT 'Concept',
  ALTER COLUMN aliases SET NOT NULL,
  ALTER COLUMN aliases SET DEFAULT '[]'::jsonb,
  ALTER COLUMN mention_count SET NOT NULL,
  ALTER COLUMN mention_count SET DEFAULT 0;

ALTER TABLE knowledge_edges
  ADD COLUMN IF NOT EXISTS source_node_id VARCHAR(80),
  ADD COLUMN IF NOT EXISTS target_node_id VARCHAR(80);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'knowledge_edges'
      AND column_name = 'source_id'
  ) THEN
    EXECUTE $repair$
      UPDATE knowledge_edges
      SET source_node_id = COALESCE(source_node_id, source_id)
    $repair$;

    EXECUTE $repair$
      ALTER TABLE knowledge_edges
        ALTER COLUMN source_id DROP NOT NULL
    $repair$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'knowledge_edges'
      AND column_name = 'target_id'
  ) THEN
    EXECUTE $repair$
      UPDATE knowledge_edges
      SET target_node_id = COALESCE(target_node_id, target_id)
    $repair$;

    EXECUTE $repair$
      ALTER TABLE knowledge_edges
        ALTER COLUMN target_id DROP NOT NULL
    $repair$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'knowledge_edges'
      AND column_name = 'attributes'
  ) THEN
    EXECUTE $repair$
      ALTER TABLE knowledge_edges
        ALTER COLUMN attributes SET DEFAULT '{}'::jsonb
    $repair$;
  END IF;
END $$;

UPDATE knowledge_edges
SET source_node_id = COALESCE(source_node_id, source_id),
    target_node_id = COALESCE(target_node_id, target_id)
WHERE source_node_id IS NULL OR target_node_id IS NULL;

ALTER TABLE knowledge_edges
  ALTER COLUMN weight SET DEFAULT 1,
  ALTER COLUMN evidence_count SET DEFAULT 0,
  ALTER COLUMN source_count SET DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM knowledge_edges WHERE source_node_id IS NULL) THEN
    ALTER TABLE knowledge_edges ALTER COLUMN source_node_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM knowledge_edges WHERE target_node_id IS NULL) THEN
    ALTER TABLE knowledge_edges ALTER COLUMN target_node_id SET NOT NULL;
  END IF;
END $$;

-- Evidence rows: current writer uses tenant/document/evidence hash columns.
ALTER TABLE edge_evidences
  ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36),
  ADD COLUMN IF NOT EXISTS document_id VARCHAR(36),
  ADD COLUMN IF NOT EXISTS evidence_hash VARCHAR(64);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'edge_evidences'
      AND column_name = 'upload_id'
  ) THEN
    EXECUTE $repair$
      UPDATE edge_evidences
      SET document_id = COALESCE(document_id, upload_id)
    $repair$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'edge_evidences'
      AND column_name = 'confidence'
  ) THEN
    EXECUTE $repair$
      ALTER TABLE edge_evidences
        ALTER COLUMN confidence SET DEFAULT 1
    $repair$;
  END IF;
END $$;

UPDATE edge_evidences ee
SET tenant_id = COALESCE(ee.tenant_id, ke.tenant_id)
FROM knowledge_edges ke
WHERE ee.edge_id = ke.id;

UPDATE edge_evidences
SET tenant_id = COALESCE(tenant_id, 'tenant_demo'),
    evidence_hash = COALESCE(evidence_hash, encode(digest(id || '|' || COALESCE(evidence_text, ''), 'sha256'), 'hex'));

ALTER TABLE edge_evidences
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN evidence_hash SET NOT NULL;

-- Current index names used by Prisma migrations and query plans.
CREATE INDEX IF NOT EXISTS documents_tenant_file_hash_idx ON documents (tenant_id, file_hash);
CREATE INDEX IF NOT EXISTS documents_tenant_content_hash_idx ON documents (tenant_id, content_hash);
CREATE INDEX IF NOT EXISTS documents_content_idx ON documents (content_id);
CREATE INDEX IF NOT EXISTS document_contents_tenant_status_idx ON document_contents (tenant_id, status);
CREATE INDEX IF NOT EXISTS knowledge_nodes_tenant_type_idx ON knowledge_nodes (tenant_id, type);
CREATE INDEX IF NOT EXISTS knowledge_edges_tenant_relation_idx ON knowledge_edges (tenant_id, relation_type);
CREATE INDEX IF NOT EXISTS edge_evidences_edge_content_idx ON edge_evidences (edge_id, document_content_id);
CREATE INDEX IF NOT EXISTS edge_evidences_tenant_content_idx ON edge_evidences (tenant_id, document_content_id);
CREATE INDEX IF NOT EXISTS structured_facts_content_idx ON structured_facts (content_id);
CREATE INDEX IF NOT EXISTS structured_facts_fact_hash_idx ON structured_facts (fact_hash);
CREATE INDEX IF NOT EXISTS structured_facts_attributes_idx ON structured_facts USING gin (attributes);
CREATE INDEX IF NOT EXISTS structured_facts_source_trgm_idx ON structured_facts USING gin (source_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS qa_run_logs_tenant_created_idx ON qa_run_logs (tenant_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS chunks_content_idx_unique
  ON chunks (content_id, idx)
  WHERE content_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS structured_facts_content_fact_unique
  ON structured_facts (tenant_id, content_id, fact_hash)
  WHERE content_id IS NOT NULL AND fact_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS edge_evidences_unique_source_idx
  ON edge_evidences (edge_id, document_content_id, COALESCE(chunk_id, ''), evidence_hash);
