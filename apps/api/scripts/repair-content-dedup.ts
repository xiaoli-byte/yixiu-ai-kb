import { Pool } from "pg";
import neo4j from "neo4j-driver";
import { loadRootEnv, validateEnv } from "../src/config/env";
import {
  canonicalKey,
  contentHash,
  factHash,
  knowledgeNodeId,
  normalizeCanonicalPart,
} from "../src/common/dedup/canonical";

loadRootEnv();
validateEnv(process.env);

interface DocumentRow {
  id: string;
  tenant_id: string;
  title: string;
  mime: string;
  size: string | number;
  storage_key: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface DuplicateGroup {
  tenantId: string;
  hash: string;
  documents: DocumentRow[];
}

const apply = process.argv.includes("--apply");
const repairNeo4j = process.argv.includes("--neo4j");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
});

function pickCanonical(docs: DocumentRow[]) {
  return [...docs].sort((a, b) => {
    const readyRank = Number(b.status === "READY") - Number(a.status === "READY");
    if (readyRank !== 0) return readyRank;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  })[0];
}

async function loadDocumentText(docId: string) {
  const { rows } = await pool.query<{ text: string }>(
    `SELECT text
     FROM chunks
     WHERE document_id=$1
     ORDER BY idx ASC`,
    [docId],
  );
  return rows.map((row) => row.text).join("\n\n");
}

async function collectDuplicateGroups(): Promise<DuplicateGroup[]> {
  const { rows: documents } = await pool.query<DocumentRow>(
    `SELECT id, tenant_id, title, mime, size, storage_key, status, created_at, updated_at
     FROM documents
     ORDER BY tenant_id, created_at ASC`,
  );

  const buckets = new Map<string, DuplicateGroup>();
  for (const doc of documents) {
    const text = await loadDocumentText(doc.id);
    if (!text.trim()) continue;
    const hash = contentHash(text);
    const key = `${doc.tenant_id}:${hash}`;
    const group =
      buckets.get(key) ||
      ({
        tenantId: doc.tenant_id,
        hash,
        documents: [],
      } satisfies DuplicateGroup);
    group.documents.push(doc);
    buckets.set(key, group);
  }

  return [...buckets.values()].filter((group) => group.documents.length > 1);
}

async function ensureContent(group: DuplicateGroup, canonical: DocumentRow) {
  const contentId = canonical.id;
  await pool.query(
    `INSERT INTO document_contents (
       id, tenant_id, content_hash, title, mime, size, status, storage_key,
       canonical_document_id, chunk_count, duplicate_count, source_count,
       created_at, updated_at
     )
     VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,
       (SELECT COUNT(*)::int FROM chunks WHERE document_id=$9),
       $10,$10,$11,NOW()
     )
     ON CONFLICT (tenant_id, content_hash)
     DO UPDATE SET
       canonical_document_id = EXCLUDED.canonical_document_id,
       title = EXCLUDED.title,
       mime = EXCLUDED.mime,
       size = EXCLUDED.size,
       status = EXCLUDED.status,
       storage_key = EXCLUDED.storage_key,
       duplicate_count = EXCLUDED.duplicate_count,
       source_count = EXCLUDED.source_count,
       updated_at = NOW()
     RETURNING id`,
    [
      contentId,
      group.tenantId,
      group.hash,
      canonical.title,
      canonical.mime,
      canonical.size,
      canonical.status,
      canonical.storage_key,
      canonical.id,
      group.documents.length,
      canonical.created_at,
    ],
  );
  return contentId;
}

async function mergePostgresGroup(group: DuplicateGroup) {
  const canonical = pickCanonical(group.documents);
  const duplicateIds = group.documents.map((doc) => doc.id).filter((id) => id !== canonical.id);
  const contentId = await ensureContent(group, canonical);

  await pool.query("BEGIN");
  try {
    await pool.query(
      `UPDATE documents
       SET content_id=$3,
           content_hash=$4,
           duplicate_of_document_id = CASE WHEN id = $2 THEN NULL ELSE $2 END,
           dedup_reason = CASE WHEN id = $2 THEN NULL ELSE 'REPAIR_CONTENT_HASH' END,
           updated_at=NOW()
       WHERE tenant_id=$1 AND id = ANY($5::text[])`,
      [group.tenantId, canonical.id, contentId, group.hash, group.documents.map((doc) => doc.id)],
    );

    await pool.query(
      `UPDATE chunks
       SET content_id=$2,
           chunk_hash=encode(digest(coalesce(text, ''), 'sha256'), 'hex')
       WHERE document_id=$1`,
      [canonical.id, contentId],
    );

    await pool.query(
      `UPDATE structured_facts
       SET content_id=$2
       WHERE document_id=$1`,
      [canonical.id, contentId],
    );

    const { rows: facts } = await pool.query<any>(
      `SELECT id, domain, entity_type, entity_name, attributes, source_text
       FROM structured_facts
       WHERE document_id=$1`,
      [canonical.id],
    );
    for (const fact of facts) {
      await pool.query(
        `UPDATE structured_facts SET fact_hash=$2 WHERE id=$1`,
        [
          fact.id,
          factHash({
            domain: fact.domain,
            entityType: fact.entity_type,
            entityName: fact.entity_name,
            attributes: fact.attributes || {},
            sourceText: fact.source_text || "",
          }),
        ],
      );
    }

    for (const duplicateId of duplicateIds) {
      await pool.query(`DELETE FROM chunks WHERE document_id=$1`, [duplicateId]);
      await pool.query(`DELETE FROM structured_facts WHERE document_id=$1`, [duplicateId]);
    }

    await pool.query(
      `UPDATE document_contents
       SET chunk_count = (SELECT COUNT(*)::int FROM chunks WHERE content_id=$1),
           duplicate_count = (SELECT COUNT(*)::int FROM documents WHERE content_id=$1),
           source_count = (SELECT COUNT(*)::int FROM documents WHERE content_id=$1),
           updated_at = NOW()
       WHERE id=$1`,
      [contentId],
    );

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

  return { canonical, duplicateIds, contentId };
}

async function repairNeo4jGroup(args: {
  tenantId: string;
  contentId: string;
  canonical: DocumentRow;
  duplicateIds: string[];
}) {
  if (!repairNeo4j) return;
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!),
  );
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    await session.run(
      `MERGE (canonical:Document {id:$contentId})
       ON CREATE SET canonical.createdAt=$createdAt
       SET canonical.tenantId=$tenantId,
           canonical.title=$title,
           canonical.mime=$mime,
           canonical.contentId=$contentId,
           canonical.canonicalDocumentId=$canonicalDocumentId,
           canonical.updatedAt=datetime()
       WITH canonical
       UNWIND $oldIds AS oldId
       OPTIONAL MATCH (old:Document {id:oldId, tenantId:$tenantId})
       OPTIONAL MATCH (old)-[:CONTAINS_ENTITY]->(entity:Entity)
       FOREACH (_ IN CASE WHEN entity IS NULL THEN [] ELSE [1] END |
         MERGE (canonical)-[:CONTAINS_ENTITY]->(entity)
       )
       WITH canonical, collect(DISTINCT old) AS oldDocs
       UNWIND oldDocs AS oldDoc
       OPTIONAL MATCH (oldDoc)-[:HAS_CHUNK]->(chunk:Chunk)
       DETACH DELETE chunk
       WITH DISTINCT oldDoc
       DETACH DELETE oldDoc`,
      {
        tenantId: args.tenantId,
        contentId: args.contentId,
        canonicalDocumentId: args.canonical.id,
        title: args.canonical.title,
        mime: args.canonical.mime,
        createdAt: new Date(args.canonical.created_at).toISOString(),
        oldIds: args.duplicateIds,
      },
    );

    await session.run(
      `MATCH (e:Entity)
       WHERE e.tenantId = $tenantId OR (e.tenantId IS NULL AND e.id STARTS WITH $entityPrefix)
       WITH e,
            CASE WHEN e.canonicalKey IS NULL
              THEN toLower(coalesce(e.type, 'Concept')) + ':' + toLower(coalesce(e.name, ''))
              ELSE e.canonicalKey
            END AS key
       SET e.canonicalKey=key,
           e.tenantId=$tenantId
       WITH e
       OPTIONAL MATCH (e)<-[:CONTAINS_ENTITY]-(doc:Document {tenantId:$tenantId})
       WITH e, count(DISTINCT doc) AS documentCount
       OPTIONAL MATCH (e)-[:MENTIONED_IN]->(chunk:Chunk)
       WITH e, documentCount, count(DISTINCT chunk) AS mentionCount
       SET e.documentCount=documentCount,
           e.mentionCount=mentionCount`,
      {
        tenantId: args.tenantId,
        entityPrefix: `e-${args.tenantId}-`,
      },
    );
  } finally {
    await session.close();
    await driver.close();
  }
}

async function backfillKnowledgeNodes() {
  const { rows } = await pool.query<any>(
    `SELECT DISTINCT tenant_id, domain, entity_type, entity_name
     FROM structured_facts
     WHERE entity_name IS NOT NULL AND entity_name <> ''`,
  );
  for (const row of rows) {
    const key = canonicalKey(row.entity_type || row.domain || "Concept", row.entity_name);
    if (!normalizeCanonicalPart(row.entity_name)) continue;
    await pool.query(
      `INSERT INTO knowledge_nodes (id, tenant_id, canonical_key, name, type, aliases)
       VALUES ($1,$2,$3,$4,$5,to_jsonb(ARRAY[$4]::text[]))
       ON CONFLICT (tenant_id, canonical_key)
       DO UPDATE SET updated_at=NOW()`,
      [
        knowledgeNodeId(row.tenant_id, key),
        row.tenant_id,
        key,
        row.entity_name,
        row.entity_type || "Concept",
      ],
    );
  }
}

async function main() {
  const groups = await collectDuplicateGroups();
  console.log(`Found ${groups.length} duplicate content groups.`);
  for (const group of groups) {
    const canonical = pickCanonical(group.documents);
    const duplicateIds = group.documents.map((doc) => doc.id).filter((id) => id !== canonical.id);
    console.log(
      `[${group.tenantId}] hash=${group.hash.slice(0, 12)} canonical=${canonical.id} duplicates=${duplicateIds.join(",")}`,
    );
    if (!apply) continue;
    const result = await mergePostgresGroup(group);
    await repairNeo4jGroup({
      tenantId: group.tenantId,
      contentId: result.contentId,
      canonical: result.canonical,
      duplicateIds: result.duplicateIds,
    });
  }

  if (apply) {
    await backfillKnowledgeNodes();
    console.log("Repair complete.");
  } else {
    console.log("Dry run only. Re-run with --apply to merge Postgres data; add --neo4j to merge Neo4j nodes too.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
