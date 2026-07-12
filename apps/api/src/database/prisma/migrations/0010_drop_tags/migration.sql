-- 标签维度已从项目中移除（前端、后端、共享包、Prisma schema 均已清理）。
-- 先删 document_tags（FK 指向 tags），再删 tags。
-- 0001_initial_baseline 中创建的 tags / document_tags 表在此彻底清除。

DROP TABLE IF EXISTS "document_tags";
DROP TABLE IF EXISTS "tags";
