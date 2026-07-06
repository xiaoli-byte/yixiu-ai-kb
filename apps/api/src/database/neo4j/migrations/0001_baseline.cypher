// Baseline Neo4j schema for graph search and document ingestion.

CREATE CONSTRAINT user_id IF NOT EXISTS
FOR (u:User) REQUIRE u.id IS UNIQUE;

CREATE CONSTRAINT doc_id IF NOT EXISTS
FOR (d:Document) REQUIRE d.id IS UNIQUE;

CREATE CONSTRAINT tag_id IF NOT EXISTS
FOR (t:Tag) REQUIRE t.id IS UNIQUE;

CREATE CONSTRAINT tag_name_type IF NOT EXISTS
FOR (t:Tag) REQUIRE (t.name, t.type) IS UNIQUE;

CREATE CONSTRAINT chunk_id IF NOT EXISTS
FOR (c:Chunk) REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT entity_id IF NOT EXISTS
FOR (e:Entity) REQUIRE e.id IS UNIQUE;

CREATE CONSTRAINT conversation_id IF NOT EXISTS
FOR (c:QAConversation) REQUIRE c.id IS UNIQUE;

CREATE INDEX user_tenant_email IF NOT EXISTS
FOR (u:User) ON (u.tenantId, u.email);

CREATE INDEX document_tenant_status IF NOT EXISTS
FOR (d:Document) ON (d.tenantId, d.status);

CREATE INDEX doc_tenant IF NOT EXISTS
FOR (d:Document) ON (d.tenantId);

CREATE INDEX document_content_hash IF NOT EXISTS
FOR (d:Document) ON (d.contentHash);

CREATE INDEX document_owner IF NOT EXISTS
FOR (d:Document) ON (d.ownerId);

CREATE INDEX chunk_document IF NOT EXISTS
FOR (c:Chunk) ON (c.documentId);

CREATE INDEX entity_name IF NOT EXISTS
FOR (e:Entity) ON (e.name);

CREATE INDEX entity_canonical_key IF NOT EXISTS
FOR (e:Entity) ON (e.canonicalKey);

CREATE INDEX entity_type IF NOT EXISTS
FOR (e:Entity) ON (e.type);

CREATE INDEX relation_edge_key IF NOT EXISTS
FOR ()-[r:RELATES_TO]-() ON (r.edgeKey);

CREATE INDEX conv_user_updated IF NOT EXISTS
FOR (c:QAConversation) ON (c.userId, c.updatedAt);
