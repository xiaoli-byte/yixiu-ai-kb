-- 文件夹表
CREATE TABLE IF NOT EXISTS "folders" (
  "id"         TEXT PRIMARY KEY,
  "tenant_id"  TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "parent_id"  TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("tenant_id", "name", "parent_id")
);
CREATE INDEX IF NOT EXISTS "folders_tenant_idx" ON "folders"("tenant_id");
CREATE INDEX IF NOT EXISTS "folders_parent_idx" ON "folders"("parent_id");

-- 添加文件夹外键约束
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_folder_id_fkey";
ALTER TABLE "documents" ADD CONSTRAINT "documents_folder_id_fkey"
  FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE SET NULL;
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "folders"("id") ON DELETE CASCADE;
