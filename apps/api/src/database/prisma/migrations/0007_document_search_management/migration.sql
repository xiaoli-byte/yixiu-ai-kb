-- Document permission controls and search management metadata.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS permission_scope VARCHAR(30) NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN IF NOT EXISTS searchable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ai_reference_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT;

CREATE INDEX IF NOT EXISTS documents_tenant_permission_scope_idx
  ON documents (tenant_id, permission_scope);
CREATE INDEX IF NOT EXISTS documents_tenant_searchable_idx
  ON documents (tenant_id, searchable);
CREATE INDEX IF NOT EXISTS documents_tenant_archived_idx
  ON documents (tenant_id, archived);
CREATE INDEX IF NOT EXISTS documents_tenant_deleted_at_idx
  ON documents (tenant_id, deleted_at);

CREATE TABLE IF NOT EXISTS document_permissions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  subject_type VARCHAR(30) NOT NULL,
  subject_id TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT TRUE,
  can_download BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_permission BOOLEAN NOT NULL DEFAULT FALSE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_permissions_document_fk
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  CONSTRAINT document_permissions_tenant_document_subject_unique
    UNIQUE (tenant_id, document_id, subject_type, subject_id)
);

CREATE INDEX IF NOT EXISTS document_permissions_tenant_document_idx
  ON document_permissions (tenant_id, document_id);
CREATE INDEX IF NOT EXISTS document_permissions_document_idx
  ON document_permissions (document_id);
CREATE INDEX IF NOT EXISTS document_permissions_tenant_subject_idx
  ON document_permissions (tenant_id, subject_type, subject_id);

CREATE TABLE IF NOT EXISTS folder_permissions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  permission_scope VARCHAR(30) NOT NULL DEFAULT 'PRIVATE',
  searchable BOOLEAN NOT NULL DEFAULT TRUE,
  ai_reference_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  subject_type VARCHAR(30) NOT NULL,
  subject_id TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT TRUE,
  can_download BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_permission BOOLEAN NOT NULL DEFAULT FALSE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT folder_permissions_folder_fk
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  CONSTRAINT folder_permissions_tenant_folder_subject_unique
    UNIQUE (tenant_id, folder_id, subject_type, subject_id)
);

CREATE INDEX IF NOT EXISTS folder_permissions_tenant_folder_idx
  ON folder_permissions (tenant_id, folder_id);
CREATE INDEX IF NOT EXISTS folder_permissions_folder_idx
  ON folder_permissions (folder_id);
CREATE INDEX IF NOT EXISTS folder_permissions_tenant_subject_idx
  ON folder_permissions (tenant_id, subject_type, subject_id);

CREATE TABLE IF NOT EXISTS permission_audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  actor_id TEXT,
  target_type VARCHAR(30) NOT NULL,
  target_id TEXT NOT NULL,
  action VARCHAR(50) NOT NULL,
  mode VARCHAR(30) NOT NULL DEFAULT 'DIRECT',
  before JSONB,
  after JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS permission_audit_logs_tenant_created_idx
  ON permission_audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS permission_audit_logs_tenant_actor_created_idx
  ON permission_audit_logs (tenant_id, actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS permission_audit_logs_tenant_target_idx
  ON permission_audit_logs (tenant_id, target_type, target_id);

CREATE TABLE IF NOT EXISTS search_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  keyword TEXT NOT NULL,
  category_id TEXT,
  document_id TEXT,
  content_id TEXT,
  chunk_id TEXT,
  result_count INTEGER NOT NULL DEFAULT 0,
  event_type VARCHAR(40) NOT NULL DEFAULT 'SEARCH',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS search_events_tenant_keyword_created_idx
  ON search_events (tenant_id, keyword, created_at DESC);
CREATE INDEX IF NOT EXISTS search_events_tenant_category_created_idx
  ON search_events (tenant_id, category_id, created_at DESC);
CREATE INDEX IF NOT EXISTS search_events_tenant_event_created_idx
  ON search_events (tenant_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS search_events_tenant_user_created_idx
  ON search_events (tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS search_events_tenant_document_event_created_idx
  ON search_events (tenant_id, document_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS search_events_tenant_content_event_created_idx
  ON search_events (tenant_id, content_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS search_events_tenant_chunk_event_created_idx
  ON search_events (tenant_id, chunk_id, event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS hot_search_keywords (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  category_id TEXT,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  weight INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS hot_search_keywords_tenant_keyword_null_category_unique
  ON hot_search_keywords (tenant_id, keyword)
  WHERE category_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS hot_search_keywords_tenant_keyword_category_not_null_unique
  ON hot_search_keywords (tenant_id, keyword, category_id)
  WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hot_search_keywords_tenant_keyword_idx
  ON hot_search_keywords (tenant_id, keyword);
CREATE INDEX IF NOT EXISTS hot_search_keywords_tenant_keyword_category_idx
  ON hot_search_keywords (tenant_id, keyword, category_id);
CREATE INDEX IF NOT EXISTS hot_search_keywords_tenant_enabled_idx
  ON hot_search_keywords (tenant_id, enabled);
CREATE INDEX IF NOT EXISTS hot_search_keywords_tenant_pinned_enabled_idx
  ON hot_search_keywords (tenant_id, pinned, enabled);

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
  FOREACH t IN ARRAY ARRAY['document_permissions', 'folder_permissions', 'hot_search_keywords']
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
