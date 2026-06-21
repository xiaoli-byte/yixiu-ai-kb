import { Injectable, Logger } from "@nestjs/common";
import { Neo4jService } from "../../database/neo4j/neo4j.service";
import { DatabaseService } from "../../database/database.service";

@Injectable()
export class GraphService {
  private readonly logger = new Logger(GraphService.name);

  constructor(
    private readonly neo4j: Neo4jService,
    private readonly db: DatabaseService,
  ) {}

  async searchAndExpand(opts: {
    keyword: string;
    type: "Entity" | "Tag" | "Document";
    limit: number;
    depth: number;
  }) {
    const tenantId = this.db.tenantId!;
    const cypher = `
      MATCH (n:${opts.type})
      WHERE (n.name CONTAINS $kw OR n.id CONTAINS $kw)
        AND (n.tenantId = $tenantId OR $tenantId IS NULL OR $type <> 'Document')
      WITH n LIMIT $limit
      OPTIONAL MATCH path = (n)-[*1..${opts.depth}]-(m)
      WITH collect(DISTINCT n) + collect(DISTINCT m) AS allNodes,
           collect(DISTINCT relationships(path)) AS rels
      UNWIND allNodes AS node
      WITH collect(DISTINCT node) AS nodes, rels
      UNWIND rels AS relGroup
      UNWIND relGroup AS rel
      RETURN nodes,
             collect(DISTINCT { id: id(rel), source: id(startNode(rel)), target: id(endNode(rel)), type: type(rel) }) AS edges
    `;
    const result = await this.neo4j.runRead(cypher, {
      kw: opts.keyword,
      tenantId,
      limit: opts.limit,
      type: opts.type,
    });

    const nodes: any[] = [];
    const edges: any[] = [];
    result.records.forEach((rec) => {
      rec.get("nodes").forEach((n: any) => {
        nodes.push({
          id: n.properties.id,
          label: n.properties.name || n.properties.title || n.properties.id,
          type: n.labels[0],
          properties: n.properties,
          val: 1,
        });
      });
      rec.get("edges").forEach((e: any) => {
        if (e && e.id) edges.push(e);
      });
    });

    // id mapping for edges: Neo4j id → domain id
    const idMap = new Map<number, string>();
    const rawNodes = result.records[0]?.get("nodes") as any[] | undefined;
    rawNodes?.forEach((n: any) => idMap.set(n.identity.toNumber(), n.properties.id));

    return {
      nodes,
      edges: edges.map((e) => ({
        id: String(e.id),
        source: idMap.get(e.source) || String(e.source),
        target: idMap.get(e.target) || String(e.target),
        label: e.type,
      })),
    };
  }

  async documentEntities(documentId: string) {
    const cypher = `
      MATCH (d:Document {id:$id})-[:CONTAINS_ENTITY]->(e:Entity)
      OPTIONAL MATCH (e)-[r:RELATES_TO]->(e2:Entity)
      RETURN collect(DISTINCT { id: e.id, label: e.name, type: 'Entity', properties: properties(e), val: 1 }) AS nodes,
             collect(DISTINCT { id: id(r), source: e.id, target: e2.id, type: type(r) }) AS edges
    `;
    const result = await this.neo4j.runRead(cypher, { id: documentId });
    if (result.records.length === 0) return { nodes: [], edges: [] };
    const rec = result.records[0];
    return {
      nodes: rec.get("nodes").filter((n: any) => n.id),
      edges: rec.get("edges").filter((e: any) => e && e.id),
    };
  }

  async listTopEntities(tenantId: string, limit: number) {
    const cypher = `
      MATCH (e:Entity)
      WHERE e.tenantId = $tenantId OR e.tenantId IS NULL
      OPTIONAL MATCH (e)<-[:CONTAINS_ENTITY]-(d:Document)
      WITH e, count(DISTINCT d) AS docCount
      RETURN e.id AS id, e.name AS label, 'Entity' AS type, properties(e) AS properties, docCount AS val
      ORDER BY docCount DESC
      LIMIT $limit
    `;
    const result = await this.neo4j.runRead(cypher, { tenantId, limit });
    return result.records.map((r) => ({
      id: r.get("id"),
      label: r.get("label") || r.get("id"),
      type: r.get("type"),
      properties: r.get("properties"),
      val: Number(r.get("val")) || 1,
    }));
  }
}