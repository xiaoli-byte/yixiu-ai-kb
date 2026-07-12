-- QA 长会话滚动摘要：qa_conversations 增加 summary / summary_message_count
ALTER TABLE "qa_conversations"
  ADD COLUMN IF NOT EXISTS "summary" TEXT,
  ADD COLUMN IF NOT EXISTS "summary_message_count" INTEGER NOT NULL DEFAULT 0;
