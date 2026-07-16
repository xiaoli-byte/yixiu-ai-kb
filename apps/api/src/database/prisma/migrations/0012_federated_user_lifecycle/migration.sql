-- CALL-13: retain federated users for document ownership while allowing
-- ai-call to disable or soft-delete their access.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS "users_tenant_id_status_idx"
  ON "users"("tenant_id", "status");
