// Neo4j 启动时自动执行的 Cypher 初始化脚本
// 创建必要的约束和索引（幂等操作）

// 用户约束
CREATE CONSTRAINT user_id IF NOT EXISTS
FOR (u:User) REQUIRE u.id IS UNIQUE;

// 文档约束
CREATE CONSTRAINT document_id IF NOT EXISTS
FOR (d:Document) REQUIRE d.id IS UNIQUE;

// 标签约束
CREATE CONSTRAINT tag_id IF NOT EXISTS
FOR (t:Tag) REQUIRE t.id IS UNIQUE;
CREATE CONSTRAINT tag_name_type IF NOT EXISTS
FOR (t:Tag) REQUIRE (t.name, t.type) IS UNIQUE;

// Chunk 约束
CREATE CONSTRAINT chunk_id IF NOT EXISTS
FOR (c:Chunk) REQUIRE c.id IS UNIQUE;

// QA Conversation 约束
CREATE CONSTRAINT conversation_id IF NOT EXISTS
FOR (c:QAConversation) REQUIRE c.id IS UNIQUE;

// 常用索引（加速查询）
CREATE INDEX user_tenant_email IF NOT EXISTS FOR (u:User) ON (u.tenantId, u.email);
CREATE INDEX document_tenant_status IF NOT EXISTS FOR (d:Document) ON (d.tenantId, d.status);
CREATE INDEX document_owner IF NOT EXISTS FOR (d:Document) ON (d.ownerId);
CREATE INDEX chunk_document IF NOT EXISTS FOR (c:Chunk) ON (c.documentId);
CREATE INDEX conv_user_updated IF NOT EXISTS FOR (c:QAConversation) ON (c.userId, c.updatedAt);
