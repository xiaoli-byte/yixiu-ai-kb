-- Graph governance, evidence metadata, and saved graph views.

ALTER TABLE knowledge_nodes
  ADD COLUMN IF NOT EXISTS merge_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS merged_into_node_id TEXT,
  ADD COLUMN IF NOT EXISTS merged_by TEXT,
  ADD COLUMN IF NOT EXISTS merged_reason TEXT,
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS knowledge_nodes_tenant_merge_status_idx
  ON knowledge_nodes (tenant_id, merge_status);

ALTER TABLE knowledge_edges
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(30) NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(30) NOT NULL DEFAULT 'AI',
  ADD COLUMN IF NOT EXISTS edited_by TEXT,
  ADD COLUMN IF NOT EXISTS edited_reason TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS knowledge_edges_tenant_status_review_idx
  ON knowledge_edges (tenant_id, status, review_status);

ALTER TABLE edge_evidences
  ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(30) NOT NULL DEFAULT 'AI';

CREATE TABLE IF NOT EXISTS knowledge_graph_changes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  action VARCHAR(80) NOT NULL,
  node_id TEXT,
  edge_id TEXT,
  reason TEXT,
  before JSONB,
  after JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT knowledge_graph_changes_node_fk
    FOREIGN KEY (node_id) REFERENCES knowledge_nodes(id) ON DELETE SET NULL,
  CONSTRAINT knowledge_graph_changes_edge_fk
    FOREIGN KEY (edge_id) REFERENCES knowledge_edges(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS knowledge_graph_changes_tenant_created_idx
  ON knowledge_graph_changes (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_graph_changes_node_idx
  ON knowledge_graph_changes (node_id);
CREATE INDEX IF NOT EXISTS knowledge_graph_changes_edge_idx
  ON knowledge_graph_changes (edge_id);

CREATE TABLE IF NOT EXISTS knowledge_graph_views (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  visibility VARCHAR(30) NOT NULL DEFAULT 'PRIVATE',
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  layout JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_graph_views_tenant_user_idx
  ON knowledge_graph_views (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS knowledge_graph_views_tenant_visibility_idx
  ON knowledge_graph_views (tenant_id, visibility);
