-- Search and QA interaction enhancements.

ALTER TABLE qa_messages
  ADD COLUMN IF NOT EXISTS feedback_rating VARCHAR(20),
  ADD COLUMN IF NOT EXISTS feedback_text TEXT,
  ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS qa_messages_feedback_rating_idx
  ON qa_messages (feedback_rating);

CREATE TABLE IF NOT EXISTS search_histories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  query TEXT NOT NULL,
  mode VARCHAR(30) NOT NULL DEFAULT 'hybrid',
  sort_by VARCHAR(30) NOT NULL DEFAULT 'relevance',
  top_k INTEGER NOT NULL DEFAULT 10,
  result_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS search_histories_tenant_user_created_idx
  ON search_histories (tenant_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS search_histories_tenant_user_query_idx
  ON search_histories (tenant_id, user_id, query);
