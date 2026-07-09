-- KB-02: User.role -> Membership.roles[] (docs/authz-implementation-backlog.md).
-- Additive only, no foreign keys yet (same deferral rationale as 0008_tenant_entity).
-- Backfills one Membership row per existing User from their current bare `role` column;
-- User.role itself is untouched and kept for transition-period dual reads (see the
-- @deprecated doc comment on User.role in schema.prisma).

CREATE TABLE IF NOT EXISTS memberships (
  user_id    TEXT NOT NULL,
  tenant_id  TEXT NOT NULL,
  roles      TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);

-- Idempotent backfill: safe to re-run, ON CONFLICT keeps this from duplicating or
-- clobbering a Membership row that KB-03+ application code may have already touched.
INSERT INTO memberships (user_id, tenant_id, roles, created_at, updated_at)
SELECT id, tenant_id, ARRAY[role]::text[], now(), now()
FROM users
ON CONFLICT (user_id, tenant_id) DO NOTHING;
