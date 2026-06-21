// Neo4j 初始化：约束 + 索引
// 由 API 启动时通过 driver 执行（如果需要也可使用 neo4j-admin / cypher-shell 预加载）

CREATE CONSTRAINT doc_id IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE;
CREATE CONSTRAINT chunk_id IF NOT EXISTS FOR (c:Chunk) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE;
CREATE CONSTRAINT tag_id IF NOT EXISTS FOR (t:Tag) REQUIRE t.id IS UNIQUE;

CREATE INDEX entity_name IF NOT EXISTS FOR (e:Entity) ON (e.name);
CREATE INDEX entity_type IF NOT EXISTS FOR (e:Entity) ON (e.type);
CREATE INDEX doc_tenant IF NOT EXISTS FOR (d:Document) ON (d.tenantId);
CREATE INDEX chunk_doc IF NOT EXISTS FOR (c:Chunk) ON (c.documentId);