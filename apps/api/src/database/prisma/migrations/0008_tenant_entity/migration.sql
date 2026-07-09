-- KB-01: introduce the Tenant entity (docs/authz-implementation-backlog.md).
-- Additive only — does not touch the existing bare `tenant_id` string columns on
-- other tables and adds no foreign keys yet (that is deliberately deferred).

CREATE TABLE IF NOT EXISTS tenants (
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL,
  name       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_key ON tenants (slug);
