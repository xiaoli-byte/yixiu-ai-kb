-- Canonical document content + graph deduplication.
-- Existing documents remain as upload records; document_contents is the canonical content table.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'documents_content_id_fkey'
      AND table_name = 'documents'
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_content_id_fkey
      FOREIGN KEY (content_id) REFERENCES document_contents(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS content_id VARCHAR(36),
  ADD COLUMN IF NOT EXISTS chunk_hash VARCHAR(64);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chunks_content_id_fkey'
      AND table_name = 'chunks'
  ) THEN
    ALTER TABLE chunks
      ADD CONSTRAINT chunks_content_id_fkey
      FOREIGN KEY (content_id) REFERENCES document_contents(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE structured_facts
  ADD COLUMN IF NOT EXISTS content_id VARCHAR(36),
  ADD COLUMN IF NOT EXISTS fact_hash VARCHAR(64);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'structured_facts_content_id_fkey'
      AND table_name = 'structured_facts'
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
  id              VARCHAR(80)  NOT NULL,
  tenant_id       VARCHAR(36)  NOT NULL,
  source_node_id  VARCHAR(80)  NOT NULL,
  target_node_id  VARCHAR(80)  NOT NULL,
  relation_type   VARCHAR(120) NOT NULL DEFAULT 'RELATED',
  edge_key        VARCHAR(1600) NOT NULL,
  weight          INT          NOT NULL DEFAULT 1,
  evidence_count  INT          NOT NULL DEFAULT 0,
  source_count    INT          NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
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

-- Legacy backfill: every existing upload becomes its own canonical content until the repair script
-- computes real content hashes and merges duplicates.
INSERT INTO document_contents (
  id, tenant_id, content_hash, first_file_hash, title, mime, size, status,
  storage_key, canonical_document_id, chunk_count, duplicate_count, source_count,
  error_message, created_at, updated_at
)
SELECT d.id,
       d.tenant_id,
       'legacy:' || d.id,
       d.file_hash,
       d.title,
       d.mime,
       d.size,
       d.status,
       d.storage_key,
       d.id,
       COALESCE(chunk_counts.chunk_count, 0),
       1,
       1,
       d.error_message,
       d.created_at,
       d.updated_at
FROM documents d
LEFT JOIN (
  SELECT document_id, COUNT(*)::int AS chunk_count
  FROM chunks
  GROUP BY document_id
) chunk_counts ON chunk_counts.document_id = d.id
WHERE d.content_id IS NULL
ON CONFLICT (tenant_id, content_hash) DO NOTHING;

UPDATE documents d
SET content_id = dc.id,
    content_hash = dc.content_hash
FROM document_contents dc
WHERE d.content_id IS NULL
  AND dc.id = d.id;

UPDATE chunks c
SET content_id = d.content_id,
    chunk_hash = encode(digest(coalesce(c.text, ''), 'sha256'), 'hex')
FROM documents d
WHERE c.document_id = d.id
  AND c.content_id IS NULL;

UPDATE structured_facts sf
SET content_id = d.content_id,
    fact_hash = encode(
      digest(
        coalesce(sf.domain, '') || '|' ||
        coalesce(sf.entity_type, '') || '|' ||
        coalesce(sf.entity_name, '') || '|' ||
        coalesce(sf.attributes::text, '') || '|' ||
        coalesce(sf.source_text, ''),
        'sha256'
      ),
      'hex'
    )
FROM documents d
WHERE sf.document_id = d.id
  AND sf.content_id IS NULL;

CREATE INDEX IF NOT EXISTS documents_tenant_file_hash_idx ON documents (tenant_id, file_hash);
CREATE INDEX IF NOT EXISTS documents_tenant_content_hash_idx ON documents (tenant_id, content_hash);
CREATE INDEX IF NOT EXISTS documents_content_idx ON documents (content_id);

CREATE INDEX IF NOT EXISTS document_contents_tenant_status_idx
  ON document_contents (tenant_id, status);

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

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['document_contents', 'knowledge_nodes', 'knowledge_edges']
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
