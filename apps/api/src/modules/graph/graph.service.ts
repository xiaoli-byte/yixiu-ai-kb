import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import neo4j from "neo4j-driver";
import { v4 as uuid } from "uuid";
import { Neo4jService } from "../../database/neo4j/neo4j.service";
import { DatabaseService } from "../../database/database.service";
import { edgeKey, relationKeyPart, sha256Hex } from "../../common/dedup/canonical";

type GraphNodeType = "Document" | "Chunk" | "Entity" | "Tag";
type ExploreNodeType = "all" | "Document" | "Entity" | "Tag";

interface GraphNodeDto {
  id: string;
  label: string;
  type: GraphNodeType;
  properties: Record<string, unknown>;
  val?: number;
}

interface GraphEdgeDto {
  id: string;
  source: string;
  target: string;
  label: string;
  weight?: number;
  properties?: Record<string, unknown>;
  evidenceSummary?: {
    evidenceCount: number;
    sourceCount?: number;
    maxConfidence?: number | null;
    documentTitles: string[];
  };
}

interface GraphDataDto {
  nodes: GraphNodeDto[];
  edges: GraphEdgeDto[];
}

interface GraphExploreOptions {
  keyword?: string;
  nodeType?: ExploreNodeType;
  documentId?: string;
  entityType?: string;
  relationType?: string;
  categoryId?: string;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  limit?: number;
  depth?: number;
}

interface NormalizedGraphExploreOptions {
  keyword?: string;
  nodeType: ExploreNodeType;
  documentId?: string;
  entityType?: string;
  relationType?: string;
  categoryId?: string;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  limit: number;
  depth: number;
}

interface GraphCategoryDto {
  id: string;
  name: string;
  type?: string;
  documentCount: number;
}

interface KnowledgeNodeRow {
  id: string;
  canonical_key: string;
  name: string;
  type: string;
  aliases: unknown;
  merge_status?: string;
  merged_into_node_id?: string | null;
}

interface KnowledgeEdgeRow {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relation_type: string;
  edge_key: string;
  weight: string | number;
  evidence_count: string | number;
  source_count: string | number;
  status?: string;
  review_status?: string;
  source_type?: string;
  updated_at?: Date | string;
}

@Injectable()
export class GraphService {
  constructor(
    private readonly neo4j: Neo4jService,
    private readonly db: DatabaseService,
  ) {}

  async explore(opts: GraphExploreOptions = {}) {
    const tenantId = this.db.tenantId!;
    const normalized = this.normalizeExploreOptions(opts);
    const categories = await this.listCategories(tenantId);
    const graphParts: GraphDataDto[] = [];

    const documentSeedIds = await this.resolveDocumentSeedIds(tenantId, normalized);
    const hasDocumentConstraint = Boolean(
      normalized.categoryId ||
        normalized.createdFrom ||
        normalized.createdTo ||
        normalized.nodeType === "Document" ||
        normalized.nodeType === "Tag",
    );

    if (documentSeedIds.length > 0) {
      graphParts.push(
        await this.queryDocumentGraph({
          tenantId,
          documentIds: documentSeedIds,
          depth: normalized.depth,
          limit: normalized.limit,
          entityType: normalized.entityType,
          relationType: normalized.relationType,
        }),
      );
    }

    const shouldSearchEntities =
      normalized.nodeType === "all" || normalized.nodeType === "Entity";
    if (shouldSearchEntities && (!hasDocumentConstraint || normalized.keyword)) {
      const entityGraph = await this.queryEntityGraph({
        tenantId,
        keyword: normalized.keyword,
        depth: normalized.depth,
        limit: normalized.limit,
        entityType: normalized.entityType,
        relationType: normalized.relationType,
      });
      if (entityGraph.nodes.length > 0) graphParts.push(entityGraph);
    }

    if (graphParts.length === 0 && !hasDocumentConstraint) {
      graphParts.push(
        await this.queryEntityGraph({
          tenantId,
          keyword: normalized.keyword,
          depth: normalized.depth,
          limit: normalized.limit,
          entityType: normalized.entityType,
          relationType: normalized.relationType,
        }),
      );
    }

    const graph = await this.enrichGraph(
      this.limitGraph(this.mergeGraphs(graphParts), normalized.limit),
      tenantId,
      normalized,
    );
    const limitedGraph = await this.hydrateEdgeEvidenceSummaries(
      this.limitGraph(graph, normalized.limit),
    );
    const matchedNodeIds = this.findMatchedNodeIds(limitedGraph, normalized.keyword);

    return {
      graph: limitedGraph,
      stats: this.buildStats(limitedGraph, categories.length),
      topNodes: await this.listTopEntities(tenantId, 5),
      recentNodes: await this.listRecentNodes(tenantId, 6),
      categories,
      matchedNodeIds,
      centerNodeId: matchedNodeIds[0] || limitedGraph.nodes[0]?.id || null,
      filterOptions: await this.listFilterOptions(tenantId),
    };
  }

  async searchAndExpand(opts: {
    keyword: string;
    type: "Entity" | "Tag" | "Document";
    limit: number;
    depth: number;
  }) {
    const workspace = await this.explore({
      keyword: opts.keyword,
      nodeType: opts.type,
      limit: opts.limit,
      depth: opts.depth,
    });
    return workspace.graph;
  }

  async documentEntities(documentId: string) {
    const tenantId = this.db.tenantId!;
    const row = await this.db.queryOne<{ content_id: string }>(
      `SELECT COALESCE(content_id, id) AS content_id
       FROM documents
       WHERE tenant_id=$1 AND id=$2
       UNION ALL
       SELECT id AS content_id
       FROM document_contents
       WHERE tenant_id=$1 AND id=$2
       LIMIT 1`,
      [tenantId, documentId],
    );
    const contentId = row?.content_id || documentId;
    const graph = await this.queryDocumentGraph({
      tenantId,
      documentIds: [contentId],
      depth: 2,
      limit: 80,
      entityType: undefined,
      relationType: undefined,
    });

    return {
      nodes: graph.nodes.filter((node) => node.type === "Entity"),
      edges: graph.edges,
    };
  }

  async listTopEntities(tenantId: string, limit: number) {
    const safeLimit = this.clampNumber(limit, 1, 50, 5);
    const result = await this.neo4j.runRead(
      `
        MATCH (e:Entity)
        WHERE ${this.entityTenantPredicate("e")}
        OPTIONAL MATCH (e)<-[:CONTAINS_ENTITY]-(d:Document {tenantId: $tenantId})
        OPTIONAL MATCH (e)-[r:RELATES_TO]-(:Entity)
        WITH e, count(DISTINCT d) AS documentCount, count(DISTINCT r) AS relationCount
        RETURN e AS node, documentCount, relationCount
        ORDER BY documentCount DESC, relationCount DESC, coalesce(e.updatedAt, e.createdAt, "") DESC
        LIMIT $limit
      `,
      {
        tenantId,
        entityIdPrefix: this.entityIdPrefix(tenantId),
        limit: neo4j.int(safeLimit),
      },
    );

    return result.records.map((record) => {
      const node = this.mapNeo4jNode(record.get("node"));
      const documentCount = this.neoNumber(record.get("documentCount"));
      const relationCount = this.neoNumber(record.get("relationCount"));
      return {
        ...node,
        val: Math.max(documentCount, relationCount, 1),
        documentCount,
        relationCount,
      };
    });
  }

  async edgeEvidence(edgeId: string) {
    const tenantId = this.currentTenantId();
    const edge = await this.db.queryOne<any>(
      `SELECT ke.id,
              ke.source_node_id,
              ke.target_node_id,
              ke.relation_type,
              ke.weight,
              ke.evidence_count,
              ke.source_count,
              ke.status,
              ke.review_status,
              ke.source_type,
              ke.updated_at,
              source.name AS source_name,
              target.name AS target_name
       FROM knowledge_edges ke
       JOIN knowledge_nodes source ON source.id = ke.source_node_id
       JOIN knowledge_nodes target ON target.id = ke.target_node_id
       WHERE ke.tenant_id=$1 AND ke.id=$2`,
      [tenantId, edgeId],
    );
    if (!edge) throw new NotFoundException("关系不存在");

    return {
      edge: {
        id: edge.id,
        sourceNodeId: edge.source_node_id,
        targetNodeId: edge.target_node_id,
        sourceName: edge.source_name,
        targetName: edge.target_name,
        relationType: edge.relation_type,
        weight: Number(edge.weight) || 1,
        evidenceCount: Number(edge.evidence_count) || 0,
        sourceCount: Number(edge.source_count) || 0,
        status: edge.status || "ACTIVE",
        reviewStatus: edge.review_status || "APPROVED",
        sourceType: edge.source_type || "AI",
        updatedAt: this.iso(edge.updated_at),
      },
      evidences: await this.listEvidenceRows({ tenantId, edgeId }),
    };
  }

  async nodeEvidence(nodeId: string) {
    const tenantId = this.currentTenantId();
    const node = await this.db.queryOne<any>(
      `SELECT id, name, type, aliases, source_count, mention_count, merge_status, merged_into_node_id, updated_at
       FROM knowledge_nodes
       WHERE tenant_id=$1 AND id=$2`,
      [tenantId, nodeId],
    );
    if (!node) throw new NotFoundException("实体不存在");

    const evidences = await this.listEvidenceRows({ tenantId, nodeId });
    return {
      node: {
        id: node.id,
        label: node.name,
        type: "Entity" as const,
        aliases: this.stringArray(node.aliases),
        mergeStatus: node.merge_status || "ACTIVE",
        mergedIntoNodeId: node.merged_into_node_id,
        properties: {
          name: node.name,
          type: node.type,
          sourceCount: Number(node.source_count) || 0,
          mentionCount: Number(node.mention_count) || 0,
          updatedAt: this.iso(node.updated_at),
        },
        val: Math.max(Number(node.source_count) || 0, Number(node.mention_count) || 1),
      },
      evidences,
    };
  }

  async shortestPath(opts: { sourceId: string; targetId: string; maxDepth?: number }) {
    const tenantId = this.currentTenantId();
    const maxDepth = this.clampNumber(opts.maxDepth, 1, 5, 3);
    if (!opts.sourceId || !opts.targetId || opts.sourceId === opts.targetId) {
      throw new BadRequestException("请选择两个不同实体");
    }

    const result = await this.neo4j.runRead(
      `
        MATCH (source:Entity {id:$sourceId}), (target:Entity {id:$targetId})
        WHERE ${this.entityTenantPredicate("source")} AND ${this.entityTenantPredicate("target")}
        MATCH p = shortestPath((source)-[:RELATES_TO*..${maxDepth}]-(target))
        WHERE all(rel IN relationships(p) WHERE ${this.relationActivePredicate("rel")})
        RETURN nodes(p) AS nodes,
               [rel IN relationships(p) | {
                 id: elementId(rel),
                 source: id(startNode(rel)),
                 target: id(endNode(rel)),
                 type: type(rel),
                 properties: properties(rel)
               }] AS edges
        LIMIT 1
      `,
      {
        tenantId,
        entityIdPrefix: this.entityIdPrefix(tenantId),
        sourceId: opts.sourceId,
        targetId: opts.targetId,
      },
    );

    if (!result.records.length) return { found: false, graph: { nodes: [], edges: [] } };
    const graph = await this.hydrateEdgeEvidenceSummaries(
      this.mapGraphRecords(result.records, 80),
    );
    return { found: graph.nodes.length > 0, graph };
  }

  async listViews() {
    const tenantId = this.currentTenantId();
    const userId = this.currentUserId();
    const rows = await this.db.query<any>(
      `SELECT id, name, description, tenant_id, user_id, visibility, filters, layout, created_at, updated_at
       FROM knowledge_graph_views
       WHERE tenant_id=$1 AND (user_id=$2 OR visibility='SHARED')
       ORDER BY updated_at DESC, name ASC`,
      [tenantId, userId],
    );
    return rows.map((row) => this.mapView(row));
  }

  async saveView(input: {
    name: string;
    description?: string;
    visibility?: "PRIVATE" | "SHARED";
    filters: Record<string, unknown>;
    layout?: Record<string, unknown>;
  }) {
    const tenantId = this.currentTenantId();
    const userId = this.currentUserId();
    const visibility = input.visibility || "PRIVATE";
    if (visibility === "SHARED") this.assertCanShareView();
    const name = this.cleanText(input.name, 160);
    if (!name) throw new BadRequestException("视图名称不能为空");

    const row = await this.db.queryOne<any>(
      `INSERT INTO knowledge_graph_views (
         id, tenant_id, user_id, name, description, visibility, filters, layout
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)
       RETURNING id, name, description, tenant_id, user_id, visibility, filters, layout, created_at, updated_at`,
      [
        uuid(),
        tenantId,
        userId,
        name,
        this.cleanText(input.description || "", 500) || null,
        visibility,
        JSON.stringify(input.filters || {}),
        JSON.stringify(input.layout || {}),
      ],
    );
    return this.mapView(row);
  }

  async updateView(
    viewId: string,
    input: Partial<{
      name: string;
      description: string;
      visibility: "PRIVATE" | "SHARED";
      filters: Record<string, unknown>;
      layout: Record<string, unknown>;
    }>,
  ) {
    const tenantId = this.currentTenantId();
    const userId = this.currentUserId();
    const existing = await this.db.queryOne<any>(
      `SELECT * FROM knowledge_graph_views WHERE tenant_id=$1 AND id=$2`,
      [tenantId, viewId],
    );
    if (!existing) throw new NotFoundException("视图不存在");
    if (existing.user_id !== userId && existing.visibility !== "SHARED") {
      throw new ForbiddenException("不能修改其他用户的私有视图");
    }
    if (existing.user_id !== userId || input.visibility === "SHARED") this.assertCanShareView();

    const row = await this.db.queryOne<any>(
      `UPDATE knowledge_graph_views
       SET name=COALESCE($3, name),
           description=COALESCE($4, description),
           visibility=COALESCE($5, visibility),
           filters=COALESCE($6::jsonb, filters),
           layout=COALESCE($7::jsonb, layout),
           updated_at=NOW()
       WHERE tenant_id=$1 AND id=$2
       RETURNING id, name, description, tenant_id, user_id, visibility, filters, layout, created_at, updated_at`,
      [
        tenantId,
        viewId,
        input.name ? this.cleanText(input.name, 160) : null,
        input.description !== undefined ? this.cleanText(input.description, 500) : null,
        input.visibility || null,
        input.filters ? JSON.stringify(input.filters) : null,
        input.layout ? JSON.stringify(input.layout) : null,
      ],
    );
    return this.mapView(row);
  }

  async deleteView(viewId: string) {
    const tenantId = this.currentTenantId();
    const userId = this.currentUserId();
    const row = await this.db.queryOne<any>(
      `DELETE FROM knowledge_graph_views
       WHERE tenant_id=$1 AND id=$2 AND user_id=$3
       RETURNING id`,
      [tenantId, viewId, userId],
    );
    if (!row) throw new NotFoundException("视图不存在或无权删除");
    return { id: row.id };
  }

  async mergeEntity(
    sourceNodeId: string,
    input: { targetNodeId: string; aliases?: string[]; reason?: string },
  ) {
    const tenantId = this.currentTenantId();
    const userId = this.currentUserId();
    if (!sourceNodeId || !input.targetNodeId || sourceNodeId === input.targetNodeId) {
      throw new BadRequestException("请选择两个不同实体");
    }
    const source = await this.findKnowledgeNode(sourceNodeId);
    const target = await this.findKnowledgeNode(input.targetNodeId);
    const aliases = [
      ...this.stringArray(source.aliases),
      source.name,
      ...this.stringArray(input.aliases || []),
    ].filter(Boolean);

    await this.db.query(
      `UPDATE knowledge_nodes
       SET merge_status='MERGED',
           merged_into_node_id=$3,
           merged_by=$4,
           merged_reason=$5,
           merged_at=NOW(),
           updated_at=NOW()
       WHERE tenant_id=$1 AND id=$2`,
      [tenantId, sourceNodeId, input.targetNodeId, userId, input.reason || null],
    );
    await this.appendNodeAliases(input.targetNodeId, aliases);
    await this.transferMergedEntityEdges({ tenantId, source, target, reason: input.reason || null });
    await this.recordGraphChange({
      action: "ENTITY_MERGE",
      nodeId: sourceNodeId,
      reason: input.reason,
      before: { sourceNodeId, targetNodeId: input.targetNodeId },
      after: { mergeStatus: "MERGED", aliases },
    });
    await this.neo4j.run(
      `MATCH (source:Entity {id:$sourceId})
       MATCH (target:Entity {id:$targetId})
       SET source.mergeStatus='MERGED',
           source.mergedIntoId=$targetId,
           source.mergedReason=$reason,
           source.updatedAt=$now,
           target.aliases=$aliases,
           target.updatedAt=$now`,
      {
        sourceId: sourceNodeId,
        targetId: input.targetNodeId,
        reason: input.reason || null,
        aliases,
        now: new Date().toISOString(),
      },
    );
    return this.nodeEvidence(input.targetNodeId);
  }

  async updateAliases(nodeId: string, aliases: string[], reason?: string) {
    const node = await this.findKnowledgeNode(nodeId);
    await this.appendNodeAliases(nodeId, aliases);
    await this.recordGraphChange({
      action: "ENTITY_ALIAS_UPDATE",
      nodeId,
      reason,
      before: { aliases: this.stringArray(node.aliases) },
      after: { aliases },
    });
    await this.neo4j.run(
      `MATCH (node:Entity {id:$nodeId})
       SET node.aliases=$aliases, node.updatedAt=$now`,
      { nodeId, aliases, now: new Date().toISOString() },
    );
    return this.nodeEvidence(nodeId);
  }

  async createRelation(input: {
    sourceNodeId: string;
    targetNodeId: string;
    relationType: string;
    evidenceText?: string;
    documentContentId?: string;
    documentId?: string;
    chunkId?: string;
    reason?: string;
  }) {
    const tenantId = this.currentTenantId();
    const source = await this.findKnowledgeNode(input.sourceNodeId);
    const target = await this.findKnowledgeNode(input.targetNodeId);
    const relationType = relationKeyPart(input.relationType).toUpperCase();
    const key = edgeKey(source.canonical_key, relationType, target.canonical_key);
    const id = `ke-${tenantId}-${sha256Hex(key).slice(0, 32)}`;
    const row = await this.db.queryOne<KnowledgeEdgeRow>(
      `INSERT INTO knowledge_edges (
         id, tenant_id, source_node_id, target_node_id, relation_type, edge_key,
         weight, evidence_count, source_count, status, review_status, source_type, edited_by, edited_reason
       )
       VALUES ($1,$2,$3,$4,$5,$6,1,0,0,'ACTIVE','APPROVED','MANUAL',$7,$8)
       ON CONFLICT (tenant_id, edge_key)
       DO UPDATE SET
         relation_type=EXCLUDED.relation_type,
         status='ACTIVE',
         review_status='APPROVED',
         source_type='MANUAL',
         edited_by=EXCLUDED.edited_by,
         edited_reason=EXCLUDED.edited_reason,
         deleted_at=NULL,
         updated_at=NOW()
       RETURNING *`,
      [id, tenantId, source.id, target.id, relationType, key, this.currentUserId(), input.reason || null],
    );
    if (input.documentContentId && input.evidenceText) {
      await this.insertManualEvidence(row!.id, input);
    }
    await this.refreshEdgeStats(row!.id);
    const refreshed = await this.getKnowledgeEdge(row!.id);
    await this.syncRelationToNeo4j(refreshed);
    await this.recordGraphChange({
      action: "RELATION_CREATE",
      edgeId: row!.id,
      reason: input.reason,
      after: input,
    });
    return this.edgeEvidence(row!.id);
  }

  async updateRelation(
    edgeId: string,
    input: { relationType?: string; reason?: string; reviewStatus?: string },
  ) {
    const edge = await this.getKnowledgeEdge(edgeId);
    const source = await this.findKnowledgeNode(edge.source_node_id);
    const target = await this.findKnowledgeNode(edge.target_node_id);
    const relationType = input.relationType
      ? relationKeyPart(input.relationType).toUpperCase()
      : edge.relation_type;
    const key = edgeKey(source.canonical_key, relationType, target.canonical_key);
    const row = await this.db.queryOne<KnowledgeEdgeRow>(
      `UPDATE knowledge_edges
       SET relation_type=$3,
           edge_key=$4,
           review_status=COALESCE($5, review_status),
           source_type='MANUAL',
           edited_by=$6,
           edited_reason=$7,
           updated_at=NOW()
       WHERE tenant_id=$1 AND id=$2
       RETURNING *`,
      [
        this.currentTenantId(),
        edgeId,
        relationType,
        key,
        input.reviewStatus || null,
        this.currentUserId(),
        input.reason || null,
      ],
    );
    await this.syncRelationToNeo4j(row!);
    await this.recordGraphChange({
      action: "RELATION_UPDATE",
      edgeId,
      reason: input.reason,
      before: edge,
      after: row,
    });
    return this.edgeEvidence(edgeId);
  }

  async reviewRelation(edgeId: string, reviewStatus: "APPROVED" | "REJECTED" | "PENDING", reason?: string) {
    const before = await this.getKnowledgeEdge(edgeId);
    const row = await this.db.queryOne<KnowledgeEdgeRow>(
      `UPDATE knowledge_edges
       SET review_status=$3,
           edited_by=$4,
           edited_reason=$5,
           updated_at=NOW()
       WHERE tenant_id=$1 AND id=$2
       RETURNING *`,
      [this.currentTenantId(), edgeId, reviewStatus, this.currentUserId(), reason || null],
    );
    await this.syncRelationToNeo4j(row!);
    await this.recordGraphChange({
      action: "RELATION_REVIEW",
      edgeId,
      reason,
      before,
      after: row,
    });
    return this.edgeEvidence(edgeId);
  }

  async deleteRelation(edgeId: string, reason?: string) {
    const before = await this.getKnowledgeEdge(edgeId);
    const row = await this.db.queryOne<KnowledgeEdgeRow>(
      `UPDATE knowledge_edges
       SET status='DELETED',
           source_type='MANUAL',
           edited_by=$3,
           edited_reason=$4,
           deleted_at=NOW(),
           updated_at=NOW()
       WHERE tenant_id=$1 AND id=$2
       RETURNING *`,
      [this.currentTenantId(), edgeId, this.currentUserId(), reason || null],
    );
    await this.syncRelationToNeo4j(row!);
    await this.recordGraphChange({
      action: "RELATION_DELETE",
      edgeId,
      reason,
      before,
      after: row,
    });
    return { id: edgeId };
  }

  private async resolveDocumentSeedIds(
    tenantId: string,
    opts: NormalizedGraphExploreOptions,
  ): Promise<string[]> {
    const params: any[] = [tenantId];
    const where = [`d.tenant_id = $1`];
    const createdAt = this.buildDateRange(opts.createdFrom, opts.createdTo);
    const updatedAt = this.buildDateRange(opts.updatedFrom, opts.updatedTo);
    if (opts.documentId) {
      params.push(opts.documentId);
      where.push(`COALESCE(d.content_id, d.id) = $${params.length}`);
    }
    if (createdAt?.gte) {
      params.push(createdAt.gte);
      where.push(`d.created_at >= $${params.length}`);
    }
    if (createdAt?.lte) {
      params.push(createdAt.lte);
      where.push(`d.created_at <= $${params.length}`);
    }
    if (updatedAt?.gte) {
      params.push(updatedAt.gte);
      where.push(`d.updated_at >= $${params.length}`);
    }
    if (updatedAt?.lte) {
      params.push(updatedAt.lte);
      where.push(`d.updated_at <= $${params.length}`);
    }
    if (opts.categoryId) {
      params.push(opts.categoryId);
      where.push(`d.folder_id = $${params.length}`);
    }
    const keyword = opts.keyword?.trim();
    if (keyword && (opts.nodeType === "all" || opts.nodeType === "Document")) {
      params.push(`%${keyword}%`);
      where.push(`(
        d.title ILIKE $${params.length}
        OR EXISTS (
          SELECT 1
          FROM folders f
          WHERE f.id = d.folder_id
            AND f.tenant_id = d.tenant_id
            AND f.name ILIKE $${params.length}
        )
      )`);
    } else if (keyword && opts.nodeType === "Tag") {
      params.push(`%${keyword}%`);
      where.push(`EXISTS (
        SELECT 1
        FROM folders f
        WHERE f.id = d.folder_id
          AND f.tenant_id = d.tenant_id
          AND f.name ILIKE $${params.length}
      )`);
    }

    const shouldQueryDocuments =
      opts.nodeType === "Document" ||
      opts.nodeType === "Tag" ||
      Boolean(opts.documentId || opts.categoryId || opts.createdFrom || opts.createdTo || opts.updatedFrom || opts.updatedTo) ||
      Boolean(keyword && opts.nodeType === "all");

    if (!shouldQueryDocuments) return [];

    params.push(opts.limit);
    const rows = await this.db.query<{ content_id: string }>(
      `SELECT DISTINCT COALESCE(d.content_id, d.id) AS content_id,
              MAX(d.updated_at) AS updated_at
       FROM documents d
       WHERE ${where.join(" AND ")}
       GROUP BY COALESCE(d.content_id, d.id)
       ORDER BY updated_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows.map((row) => row.content_id).filter(Boolean);
  }

  private async queryDocumentGraph(opts: {
    tenantId: string;
    documentIds: string[];
    depth: number;
    limit: number;
    entityType?: string;
    relationType?: string;
  }): Promise<GraphDataDto> {
    if (opts.documentIds.length === 0) return { nodes: [], edges: [] };

    const result = await this.neo4j.runRead(
      `
        MATCH (d:Document)
        WHERE d.tenantId = $tenantId AND d.id IN $documentIds
        OPTIONAL MATCH (d)-[contains:CONTAINS_ENTITY]->(e:Entity)
        WHERE e IS NULL OR (${this.entityTenantPredicate("e")} AND ($entityType = "" OR e.type = $entityType))
        OPTIONAL MATCH (e)-[related:RELATES_TO]-(neighbor:Entity)
        WHERE $depth >= 2
          AND ${this.entityTenantPredicate("neighbor")}
          AND ${this.relationActivePredicate("related")}
          AND ($relationType = "" OR related.type = $relationType)
        OPTIONAL MATCH (neighbor)<-[neighborContains:CONTAINS_ENTITY]-(neighborDoc:Document)
        WHERE $depth >= 3 AND neighborDoc.tenantId = $tenantId
        WITH collect(DISTINCT d) + collect(DISTINCT e) + collect(DISTINCT neighbor) + collect(DISTINCT neighborDoc) AS rawNodes,
             collect(DISTINCT contains) + collect(DISTINCT related) + collect(DISTINCT neighborContains) AS rawEdges
        RETURN [node IN rawNodes WHERE node IS NOT NULL AND NOT node:Chunk] AS nodes,
               [rel IN rawEdges WHERE rel IS NOT NULL | {
                 id: elementId(rel),
                 source: id(startNode(rel)),
                 target: id(endNode(rel)),
                 type: type(rel),
                 properties: properties(rel)
               }] AS edges
      `,
      {
        tenantId: opts.tenantId,
        entityIdPrefix: this.entityIdPrefix(opts.tenantId),
        documentIds: opts.documentIds,
        depth: opts.depth,
        entityType: opts.entityType || "",
        relationType: opts.relationType || "",
      },
    );

    return this.mapGraphRecords(result.records, opts.limit);
  }

  private async queryEntityGraph(opts: {
    tenantId: string;
    keyword?: string;
    depth: number;
    limit: number;
    entityType?: string;
    relationType?: string;
  }): Promise<GraphDataDto> {
    const keyword = opts.keyword?.trim().toLowerCase() || "";
    const seedLimit = Math.max(1, Math.min(opts.limit, 60));
    const result = await this.neo4j.runRead(
      `
        MATCH (seed:Entity)
        WHERE ${this.entityTenantPredicate("seed")}
          AND (
            $keyword = ""
            OR toLower(coalesce(seed.name, "")) CONTAINS $keyword
            OR toLower(coalesce(seed.id, "")) CONTAINS $keyword
            OR toLower(coalesce(seed.type, "")) CONTAINS $keyword
          )
          AND ($entityType = "" OR seed.type = $entityType)
        OPTIONAL MATCH (seed)<-[:CONTAINS_ENTITY]-(seedDoc:Document {tenantId: $tenantId})
        WITH seed, count(DISTINCT seedDoc) AS documentCount
        ORDER BY documentCount DESC, coalesce(seed.updatedAt, seed.createdAt, "") DESC
        LIMIT $seedLimit
        OPTIONAL MATCH (d:Document {tenantId: $tenantId})-[contains:CONTAINS_ENTITY]->(seed)
        OPTIONAL MATCH (seed)-[related:RELATES_TO]-(neighbor:Entity)
        WHERE $depth >= 2
          AND ${this.entityTenantPredicate("neighbor")}
          AND ${this.relationActivePredicate("related")}
          AND ($relationType = "" OR related.type = $relationType)
        OPTIONAL MATCH (neighbor)<-[neighborContains:CONTAINS_ENTITY]-(neighborDoc:Document)
        WHERE $depth >= 3 AND neighborDoc.tenantId = $tenantId
        WITH collect(DISTINCT seed) + collect(DISTINCT d) + collect(DISTINCT neighbor) + collect(DISTINCT neighborDoc) AS rawNodes,
             collect(DISTINCT contains) + collect(DISTINCT related) + collect(DISTINCT neighborContains) AS rawEdges
        RETURN [node IN rawNodes WHERE node IS NOT NULL AND NOT node:Chunk] AS nodes,
               [rel IN rawEdges WHERE rel IS NOT NULL | {
                 id: elementId(rel),
                 source: id(startNode(rel)),
                 target: id(endNode(rel)),
                 type: type(rel),
                 properties: properties(rel)
               }] AS edges
      `,
      {
        tenantId: opts.tenantId,
        entityIdPrefix: this.entityIdPrefix(opts.tenantId),
        keyword,
        depth: opts.depth,
        entityType: opts.entityType || "",
        relationType: opts.relationType || "",
        seedLimit: neo4j.int(seedLimit),
      },
    );

    return this.mapGraphRecords(result.records, opts.limit);
  }

  private async enrichGraph(
    graph: GraphDataDto,
    tenantId: string,
    opts: NormalizedGraphExploreOptions,
  ): Promise<GraphDataDto> {
    const documentIds = graph.nodes
      .filter((node) => node.type === "Document")
      .map((node) => node.id);

    if (documentIds.length > 0) {
      const rows = await this.db.query<any>(
        `SELECT dc.id,
                dc.title,
                dc.mime,
                dc.size,
                dc.status,
                dc.chunk_count,
                dc.duplicate_count,
                dc.source_count,
                dc.content_hash,
                dc.canonical_document_id,
                dc.created_at,
                dc.updated_at,
                COALESCE(
                  jsonb_agg(DISTINCT jsonb_build_object('id', f.id, 'name', f.name))
                    FILTER (WHERE f.id IS NOT NULL),
                  '[]'::jsonb
                ) AS categories
         FROM document_contents dc
         LEFT JOIN documents d ON d.content_id = dc.id
         LEFT JOIN folders f ON f.id = d.folder_id AND f.tenant_id = d.tenant_id
         WHERE dc.tenant_id = $1 AND dc.id = ANY($2::text[])
         GROUP BY dc.id
         UNION ALL
         SELECT d.id,
                d.title,
                d.mime,
                d.size,
                d.status,
                0 AS chunk_count,
                1 AS duplicate_count,
                1 AS source_count,
                d.content_hash,
                d.id AS canonical_document_id,
                d.created_at,
                d.updated_at,
                COALESCE(
                  jsonb_agg(DISTINCT jsonb_build_object('id', f.id, 'name', f.name))
                    FILTER (WHERE f.id IS NOT NULL),
                  '[]'::jsonb
                ) AS categories
         FROM documents d
         LEFT JOIN folders f ON f.id = d.folder_id AND f.tenant_id = d.tenant_id
         WHERE d.tenant_id = $1
           AND d.content_id IS NULL
           AND d.id = ANY($2::text[])
         GROUP BY d.id`,
        [tenantId, documentIds],
      );
      const documentMap = new Map(rows.map((document) => [document.id, document]));

      graph.nodes = graph.nodes.map((node) => {
        if (node.type !== "Document") return node;
        const document = documentMap.get(node.id);
        if (!document) return node;
        return {
          ...node,
          label: document.title,
          properties: {
            ...node.properties,
            title: document.title,
            mime: document.mime,
            size: Number(document.size),
            status: document.status,
            contentId: document.id,
            contentHash: document.content_hash,
            canonicalDocumentId: document.canonical_document_id,
            chunkCount: Number(document.chunk_count) || 0,
            duplicateCount: Number(document.duplicate_count) || 1,
            sourceCount: Number(document.source_count) || 1,
            createdAt: new Date(document.created_at).toISOString(),
            updatedAt: new Date(document.updated_at).toISOString(),
            categories: Array.isArray(document.categories) ? document.categories : [],
          },
          val: Math.max(Number(document.source_count) || 1, Number(document.chunk_count) || 1),
        };
      });
    }

    if (opts.nodeType === "Entity") return this.filterDanglingEdges(graph);
    return this.attachTagNodes(graph, tenantId, opts);
  }

  private async attachTagNodes(
    graph: GraphDataDto,
    tenantId: string,
    opts: NormalizedGraphExploreOptions,
  ): Promise<GraphDataDto> {
    const contentIds = graph.nodes
      .filter((node) => node.type === "Document")
      .map((node) => node.id);
    if (contentIds.length === 0) return graph;

    const params: any[] = [tenantId, contentIds];
    const where = [
      `d.tenant_id = $1`,
      `COALESCE(d.content_id, d.id) = ANY($2::text[])`,
    ];
    if (opts.categoryId) {
      params.push(opts.categoryId);
      where.push(`f.id = $${params.length}`);
    }
    if (opts.keyword && opts.nodeType === "Tag") {
      params.push(`%${opts.keyword}%`);
      where.push(`f.name ILIKE $${params.length}`);
    }
    const tagLinks = await this.db.query<any>(
      `SELECT DISTINCT COALESCE(d.content_id, d.id) AS content_id,
              f.id AS tag_id,
              f.name,
              'FOLDER' AS type
       FROM documents d
       JOIN folders f ON f.id = d.folder_id AND f.tenant_id = d.tenant_id
       WHERE ${where.join(" AND ")}`,
      params,
    );

    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));

    for (const link of tagLinks) {
      const tagNodeId = this.tagNodeId(link.tag_id);
      if (!nodes.has(tagNodeId)) {
        nodes.set(tagNodeId, {
          id: tagNodeId,
          label: link.name,
          type: "Tag",
          properties: {
            tagId: link.tag_id,
            name: link.name,
            type: link.type,
          },
          val: 1,
        });
      }

      const edgeId = `content-tag-${link.content_id}-${link.tag_id}`;
      if (!edges.has(edgeId)) {
        edges.set(edgeId, {
          id: edgeId,
          source: link.content_id,
          target: tagNodeId,
          label: "标签",
          properties: { relationType: "DOCUMENT_TAG", tagId: link.tag_id },
          weight: 1,
        });
      }
    }

    return this.filterDanglingEdges({
      nodes: Array.from(nodes.values()),
      edges: Array.from(edges.values()),
    });
  }

  private async listCategories(tenantId: string): Promise<GraphCategoryDto[]> {
    const rows = await this.db.query<{
      id: string;
      name: string;
      type: string;
      document_count: string | number;
    }>(
      `
        SELECT f.id, f.name, 'FOLDER' AS type,
               COUNT(DISTINCT COALESCE(d.content_id, d.id)) AS document_count
        FROM folders f
        JOIN documents d ON d.folder_id = f.id
        WHERE d.tenant_id = $1
        GROUP BY f.id, f.name
        ORDER BY document_count DESC, f.name ASC
      `,
      [tenantId],
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type || "FOLDER",
      documentCount: Number(row.document_count) || 0,
    }));
  }

  private async listRecentNodes(tenantId: string, limit: number) {
    const rows = await this.db.query<any>(
      `SELECT dc.id,
              dc.title,
              dc.mime,
              dc.status,
              dc.updated_at,
              COALESCE(
                array_agg(DISTINCT f.name) FILTER (WHERE f.name IS NOT NULL),
                ARRAY[]::text[]
              ) AS category_names
       FROM document_contents dc
       LEFT JOIN documents d ON d.content_id = dc.id
       LEFT JOIN folders f ON f.id = d.folder_id AND f.tenant_id = d.tenant_id
       WHERE dc.tenant_id = $1
       GROUP BY dc.id
       ORDER BY dc.updated_at DESC
       LIMIT $2`,
      [tenantId, limit],
    );

    return rows.map((document) => ({
      id: document.id,
      label: document.title,
      type: "Document" as const,
      properties: {
        title: document.title,
        mime: document.mime,
        status: document.status,
      },
      val: 1,
      updatedAt: new Date(document.updated_at).toISOString(),
      categoryNames: document.category_names || [],
    }));
  }

  private async hydrateEdgeEvidenceSummaries(graph: GraphDataDto): Promise<GraphDataDto> {
    const edgeIds = graph.edges
      .map((edge) => edge.id)
      .filter((id) => id && !id.startsWith("content-tag-"));
    if (edgeIds.length === 0) return graph;

    const rows = await this.db.query<any>(
      `SELECT ee.edge_id,
              COUNT(*) AS evidence_count,
              COUNT(DISTINCT ee.document_content_id) AS source_count,
              MAX(ee.confidence) AS max_confidence,
              COALESCE(
                array_agg(DISTINCT dc.title) FILTER (WHERE dc.title IS NOT NULL),
                ARRAY[]::text[]
              ) AS document_titles
       FROM edge_evidences ee
       LEFT JOIN document_contents dc ON dc.id = ee.document_content_id
       WHERE ee.tenant_id=$1 AND ee.edge_id = ANY($2::text[])
       GROUP BY ee.edge_id`,
      [this.currentTenantId(), edgeIds],
    );
    const summaries = new Map(
      rows.map((row) => [
        row.edge_id,
        {
          evidenceCount: Number(row.evidence_count) || 0,
          sourceCount: Number(row.source_count) || 0,
          maxConfidence:
            row.max_confidence === null || row.max_confidence === undefined
              ? null
              : Number(row.max_confidence),
          documentTitles: row.document_titles || [],
        },
      ]),
    );

    return {
      nodes: graph.nodes,
      edges: graph.edges.map((edge) => ({
        ...edge,
        evidenceSummary: summaries.get(edge.id),
      })),
    };
  }

  private async listEvidenceRows(opts: {
    tenantId: string;
    edgeId?: string;
    nodeId?: string;
  }) {
    const params: any[] = [opts.tenantId];
    const where = [`ee.tenant_id=$1`, `COALESCE(ke.status, 'ACTIVE') <> 'DELETED'`];
    if (opts.edgeId) {
      params.push(opts.edgeId);
      where.push(`ee.edge_id=$${params.length}`);
    }
    if (opts.nodeId) {
      params.push(opts.nodeId);
      where.push(`(ke.source_node_id=$${params.length} OR ke.target_node_id=$${params.length})`);
    }

    const rows = await this.db.query<any>(
      `SELECT ee.id,
              ee.document_content_id,
              ee.document_id,
              ee.chunk_id,
              ee.evidence_text,
              ee.confidence,
              ee.source_type,
              ee.created_at,
              dc.title AS document_title,
              c.idx AS chunk_idx,
              c.page
       FROM edge_evidences ee
       JOIN knowledge_edges ke ON ke.id = ee.edge_id
       LEFT JOIN document_contents dc ON dc.id = ee.document_content_id
       LEFT JOIN chunks c ON c.id = ee.chunk_id
       WHERE ${where.join(" AND ")}
       ORDER BY ee.confidence DESC NULLS LAST, ee.created_at DESC
       LIMIT 50`,
      params,
    );

    return rows.map((row) => ({
      id: row.id,
      documentContentId: row.document_content_id,
      documentId: row.document_id,
      documentTitle: row.document_title,
      chunkId: row.chunk_id,
      chunkIdx: row.chunk_idx === null || row.chunk_idx === undefined ? null : Number(row.chunk_idx),
      page: row.page === null || row.page === undefined ? null : Number(row.page),
      evidenceText: row.evidence_text,
      confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
      sourceType: row.source_type || "AI",
      createdAt: this.iso(row.created_at),
    }));
  }

  private async listFilterOptions(tenantId: string) {
    const [entityTypes, relationTypes, documents] = await Promise.all([
      this.db.query<{ type: string }>(
        `SELECT DISTINCT type
         FROM knowledge_nodes
         WHERE tenant_id=$1 AND COALESCE(merge_status, 'ACTIVE') <> 'MERGED'
         ORDER BY type ASC
         LIMIT 80`,
        [tenantId],
      ),
      this.db.query<{ relation_type: string }>(
        `SELECT DISTINCT relation_type
         FROM knowledge_edges
         WHERE tenant_id=$1
           AND COALESCE(status, 'ACTIVE') <> 'DELETED'
           AND COALESCE(review_status, 'APPROVED') <> 'REJECTED'
         ORDER BY relation_type ASC
         LIMIT 80`,
        [tenantId],
      ),
      this.db.query<{ id: string; title: string }>(
        `SELECT id, title
         FROM document_contents
         WHERE tenant_id=$1 AND status='READY'
         ORDER BY updated_at DESC
         LIMIT 100`,
        [tenantId],
      ),
    ]);

    return {
      entityTypes: entityTypes.map((row) => row.type).filter(Boolean),
      relationTypes: relationTypes.map((row) => row.relation_type).filter(Boolean),
      documents,
    };
  }

  private findMatchedNodeIds(graph: GraphDataDto, keyword?: string) {
    const text = keyword?.trim().toLowerCase();
    if (!text) return [];
    return graph.nodes
      .filter((node) => {
        const haystack = [
          node.id,
          node.label,
          node.type,
          String(node.properties.name || ""),
          String(node.properties.type || ""),
          String(node.properties.title || ""),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(text);
      })
      .map((node) => node.id);
  }

  private mapView(row: any) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      userId: row.user_id,
      visibility: row.visibility || "PRIVATE",
      filters: row.filters || {},
      layout: row.layout || {},
      createdAt: this.iso(row.created_at),
      updatedAt: this.iso(row.updated_at),
    };
  }

  private assertCanShareView() {
    const role = String((this.db as any).role || "");
    if (role && !["super_admin", "admin", "editor"].includes(role)) {
      throw new ForbiddenException("共享图谱视图需要编辑者或管理员权限");
    }
  }

  private async findKnowledgeNode(id: string): Promise<KnowledgeNodeRow> {
    const row = await this.db.queryOne<KnowledgeNodeRow>(
      `SELECT id, canonical_key, name, type, aliases, merge_status, merged_into_node_id
       FROM knowledge_nodes
       WHERE tenant_id=$1 AND id=$2`,
      [this.currentTenantId(), id],
    );
    if (!row) throw new NotFoundException("实体不存在");
    if (row.merge_status === "MERGED") throw new BadRequestException("已合并实体不能作为治理目标");
    return row;
  }

  private async appendNodeAliases(nodeId: string, aliases: string[]) {
    const cleanAliases = [...new Set(aliases.map((alias) => this.cleanText(alias, 160)).filter(Boolean))];
    if (cleanAliases.length === 0) return;
    await this.db.query(
      `UPDATE knowledge_nodes
       SET aliases = (
             SELECT COALESCE(jsonb_agg(DISTINCT alias), '[]'::jsonb)
             FROM jsonb_array_elements_text(knowledge_nodes.aliases || $3::jsonb) AS alias
           ),
           updated_at=NOW()
       WHERE tenant_id=$1 AND id=$2`,
      [this.currentTenantId(), nodeId, JSON.stringify(cleanAliases)],
    );
  }

  private async transferMergedEntityEdges(opts: {
    tenantId: string;
    source: KnowledgeNodeRow;
    target: KnowledgeNodeRow;
    reason: string | null;
  }) {
    const rows = await this.db.query<any>(
      `SELECT ke.*,
              source.canonical_key AS source_key,
              target.canonical_key AS target_key
       FROM knowledge_edges ke
       JOIN knowledge_nodes source ON source.id = ke.source_node_id
       JOIN knowledge_nodes target ON target.id = ke.target_node_id
       WHERE ke.tenant_id=$1
         AND COALESCE(ke.status, 'ACTIVE') <> 'DELETED'
         AND (ke.source_node_id=$2 OR ke.target_node_id=$2)`,
      [opts.tenantId, opts.source.id],
    );

    for (const row of rows) {
      const sourceSide = row.source_node_id === opts.source.id;
      const newSourceId = sourceSide ? opts.target.id : row.source_node_id;
      const newTargetId = sourceSide ? row.target_node_id : opts.target.id;
      if (newSourceId === newTargetId) {
        await this.markEdgeDeleted(row.id, opts.reason);
        continue;
      }
      const newSourceKey = sourceSide ? opts.target.canonical_key : row.source_key;
      const newTargetKey = sourceSide ? row.target_key : opts.target.canonical_key;
      const key = edgeKey(newSourceKey, row.relation_type, newTargetKey);
      const newId = `ke-${opts.tenantId}-${sha256Hex(key).slice(0, 32)}`;
      await this.db.query(
        `INSERT INTO knowledge_edges (
           id, tenant_id, source_node_id, target_node_id, relation_type, edge_key,
           weight, evidence_count, source_count, status, review_status, source_type, edited_by, edited_reason
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,0,0,'ACTIVE',$8,'MANUAL',$9,$10)
         ON CONFLICT (tenant_id, edge_key)
         DO UPDATE SET
           weight = GREATEST(knowledge_edges.weight, EXCLUDED.weight),
           status='ACTIVE',
           updated_at=NOW()`,
        [
          newId,
          opts.tenantId,
          newSourceId,
          newTargetId,
          row.relation_type,
          key,
          Number(row.weight) || 1,
          row.review_status || "APPROVED",
          this.currentUserId(),
          opts.reason,
        ],
      );
      await this.db.query(
        `INSERT INTO edge_evidences (
           id, tenant_id, edge_id, document_content_id, document_id, chunk_id,
           evidence_hash, evidence_text, confidence, source_type
         )
         SELECT gen_random_uuid()::text,
                tenant_id,
                $2,
                document_content_id,
                document_id,
                chunk_id,
                evidence_hash,
                evidence_text,
                confidence,
                source_type
         FROM edge_evidences
         WHERE edge_id=$1
         ON CONFLICT DO NOTHING`,
        [row.id, newId],
      );
      await this.refreshEdgeStats(newId);
      await this.markEdgeDeleted(row.id, opts.reason);
    }
  }

  private async markEdgeDeleted(edgeId: string, reason: string | null) {
    await this.db.query(
      `UPDATE knowledge_edges
       SET status='DELETED',
           edited_by=$3,
           edited_reason=$4,
           deleted_at=NOW(),
           updated_at=NOW()
       WHERE tenant_id=$1 AND id=$2`,
      [this.currentTenantId(), edgeId, this.currentUserId(), reason],
    );
  }

  private async getKnowledgeEdge(edgeId: string): Promise<KnowledgeEdgeRow> {
    const row = await this.db.queryOne<KnowledgeEdgeRow>(
      `SELECT *
       FROM knowledge_edges
       WHERE tenant_id=$1 AND id=$2`,
      [this.currentTenantId(), edgeId],
    );
    if (!row) throw new NotFoundException("关系不存在");
    return row;
  }

  private async insertManualEvidence(
    edgeId: string,
    input: {
      documentContentId?: string;
      documentId?: string;
      chunkId?: string;
      evidenceText?: string;
    },
  ) {
    const text = this.cleanText(input.evidenceText || "", 1000);
    if (!input.documentContentId || !text) return;
    await this.db.query(
      `INSERT INTO edge_evidences (
         id, tenant_id, edge_id, document_content_id, document_id, chunk_id,
         evidence_hash, evidence_text, confidence, source_type
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,'MANUAL')
       ON CONFLICT DO NOTHING`,
      [
        uuid(),
        this.currentTenantId(),
        edgeId,
        input.documentContentId,
        input.documentId || null,
        input.chunkId || null,
        sha256Hex([edgeId, input.documentContentId, input.chunkId || "", text].join("|")),
        text,
      ],
    );
  }

  private async refreshEdgeStats(edgeId: string) {
    const stats = await this.db.queryOne<{
      evidence_count: string | number;
      source_count: string | number;
    }>(
      `SELECT COUNT(*) AS evidence_count,
              COUNT(DISTINCT document_content_id) AS source_count
       FROM edge_evidences
       WHERE edge_id=$1`,
      [edgeId],
    );
    await this.db.query(
      `UPDATE knowledge_edges
       SET evidence_count=$2,
           source_count=$3,
           weight=GREATEST($2, 1),
           updated_at=NOW()
       WHERE id=$1`,
      [
        edgeId,
        Number(stats?.evidence_count) || 0,
        Number(stats?.source_count) || 0,
      ],
    );
  }

  private async syncRelationToNeo4j(edge: KnowledgeEdgeRow) {
    await this.neo4j.run(
      `MATCH (source:Entity {id:$sourceId}), (target:Entity {id:$targetId})
       MERGE (source)-[rel:RELATES_TO {edgeKey:$edgeKey}]->(target)
       ON CREATE SET rel.createdAt=$now
       SET rel.edgeId=$edgeId,
           rel.tenantId=$tenantId,
           rel.type=$type,
           rel.weight=$weight,
           rel.evidenceCount=$evidenceCount,
           rel.sourceCount=$sourceCount,
           rel.status=$status,
           rel.reviewStatus=$reviewStatus,
           rel.sourceType=$sourceType,
           rel.updatedAt=$now`,
      {
        tenantId: this.currentTenantId(),
        sourceId: edge.source_node_id,
        targetId: edge.target_node_id,
        edgeId: edge.id,
        edgeKey: edge.edge_key,
        type: edge.relation_type,
        weight: Number(edge.weight) || 1,
        evidenceCount: Number(edge.evidence_count) || 0,
        sourceCount: Number(edge.source_count) || 0,
        status: edge.status || "ACTIVE",
        reviewStatus: edge.review_status || "APPROVED",
        sourceType: edge.source_type || "AI",
        now: new Date().toISOString(),
      },
    );
  }

  private async recordGraphChange(input: {
    action: string;
    nodeId?: string;
    edgeId?: string;
    reason?: string;
    before?: unknown;
    after?: unknown;
  }) {
    await this.db.query(
      `INSERT INTO knowledge_graph_changes (
         id, tenant_id, user_id, action, node_id, edge_id, reason, before, after
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
      [
        uuid(),
        this.currentTenantId(),
        this.currentUserId(),
        input.action,
        input.nodeId || null,
        input.edgeId || null,
        input.reason || null,
        input.before === undefined ? null : JSON.stringify(input.before),
        input.after === undefined ? null : JSON.stringify(input.after),
      ],
    );
  }

  private mapGraphRecords(records: any[], limit: number): GraphDataDto {
    const rawNodes: any[] = [];
    const rawEdges: any[] = [];
    const idMap = new Map<number, string>();

    for (const record of records) {
      const nodes = (record.get("nodes") || []) as any[];
      for (const node of nodes) {
        if (!node) continue;
        const mapped = this.mapNeo4jNode(node);
        if (mapped.type === "Chunk") continue;
        const internalId = this.neoNumber(node.identity);
        idMap.set(internalId, mapped.id);
        rawNodes.push({ raw: node, mapped });
      }

      const edges = (record.get("edges") || []) as any[];
      for (const edge of edges) {
        if (edge) rawEdges.push(edge);
      }
    }

    const nodes = new Map<string, GraphNodeDto>();
    for (const item of rawNodes) {
      nodes.set(item.mapped.id, item.mapped);
    }

    const edges = new Map<string, GraphEdgeDto>();
    for (const raw of rawEdges) {
      const source = idMap.get(this.neoNumber(raw.source));
      const target = idMap.get(this.neoNumber(raw.target));
      if (!source || !target || source === target) continue;

      const properties = this.normalizeProperties(raw.properties || {});
      const stableEdgeId = String(
        properties.edgeId ||
          properties.edgeKey ||
          (raw.type === "RELATES_TO"
            ? [source, properties.type || raw.type, target].join("|")
            : raw.id),
      );
      const edge: GraphEdgeDto = {
        id: stableEdgeId,
        source,
        target,
        label: this.relationLabel(String(raw.type), properties),
        properties: { relationType: raw.type, ...properties },
        weight: this.numberFromUnknown(properties.weight) || 1,
      };
      edges.set(edge.id, edge);
    }

    return this.limitGraph(
      {
        nodes: Array.from(nodes.values()),
        edges: Array.from(edges.values()),
      },
      limit,
    );
  }

  private mapNeo4jNode(node: any): GraphNodeDto {
    const properties = this.normalizeProperties(node.properties || {});
    const labels: string[] = node.labels || [];
    const type = this.resolveNodeType(labels);
    const id = String(properties.id || this.neoNumber(node.identity));

    return {
      id,
      label: String(properties.name || properties.title || properties.id || id),
      type,
      properties,
      val:
        this.numberFromUnknown(properties.documentCount) ||
        this.numberFromUnknown(properties.mentionCount) ||
        1,
    };
  }

  private mergeGraphs(parts: GraphDataDto[]): GraphDataDto {
    const nodes = new Map<string, GraphNodeDto>();
    const edges = new Map<string, GraphEdgeDto>();

    for (const part of parts) {
      for (const node of part.nodes) nodes.set(node.id, node);
      for (const edge of part.edges) edges.set(edge.id, edge);
    }

    return this.filterDanglingEdges({
      nodes: Array.from(nodes.values()),
      edges: Array.from(edges.values()),
    });
  }

  private limitGraph(graph: GraphDataDto, limit: number): GraphDataDto {
    const safeLimit = this.clampNumber(limit, 1, 150, 80);
    if (graph.nodes.length <= safeLimit) return this.filterDanglingEdges(graph);

    const sortedNodes = [...graph.nodes].sort((a, b) => {
      const rank = this.nodeRank(b) - this.nodeRank(a);
      if (rank !== 0) return rank;
      return String(b.properties.updatedAt || "").localeCompare(String(a.properties.updatedAt || ""));
    });
    const nodes = sortedNodes.slice(0, safeLimit);
    return this.filterDanglingEdges({ nodes, edges: graph.edges });
  }

  private filterDanglingEdges(graph: GraphDataDto): GraphDataDto {
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    return {
      nodes: graph.nodes,
      edges: graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
    };
  }

  private buildStats(graph: GraphDataDto, categoryTotal: number) {
    return {
      nodeTotal: graph.nodes.length,
      edgeTotal: graph.edges.length,
      documentNodeTotal: graph.nodes.filter((node) => node.type === "Document").length,
      entityNodeTotal: graph.nodes.filter((node) => node.type === "Entity").length,
      tagNodeTotal: graph.nodes.filter((node) => node.type === "Tag").length,
      categoryTotal,
    };
  }

  private normalizeExploreOptions(opts: GraphExploreOptions): NormalizedGraphExploreOptions {
    return {
      keyword: opts.keyword?.trim() || undefined,
      nodeType: opts.nodeType || "all",
      documentId: opts.documentId || undefined,
      entityType: opts.entityType?.trim() || undefined,
      relationType: opts.relationType?.trim() || undefined,
      categoryId: opts.categoryId || undefined,
      createdFrom: opts.createdFrom || undefined,
      createdTo: opts.createdTo || undefined,
      updatedFrom: opts.updatedFrom || undefined,
      updatedTo: opts.updatedTo || undefined,
      limit: this.clampNumber(opts.limit, 1, 150, 80),
      depth: this.clampNumber(opts.depth, 1, 3, 2),
    };
  }

  private buildDateRange(createdFrom?: string, createdTo?: string) {
    const range: { gte?: Date; lte?: Date } = {};
    const from = createdFrom ? new Date(createdFrom) : null;
    if (from && !Number.isNaN(from.getTime())) range.gte = from;

    const to = createdTo ? new Date(createdTo) : null;
    if (to && !Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999);
      range.lte = to;
    }

    return range.gte || range.lte ? range : null;
  }

  private relationLabel(type: string, properties: Record<string, unknown>) {
    if (type === "CONTAINS_ENTITY") return "包含";
    if (type === "HAS_CHUNK") return "分段";
    if (type === "MENTIONED_IN") return "提及";
    if (type === "RELATES_TO") {
      const relationType = String(properties.type || "").trim();
      return relationType || "关联";
    }
    return type;
  }

  private normalizeProperties(properties: Record<string, unknown>) {
    return Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [key, this.normalizeValue(value)]),
    );
  }

  private normalizeValue(value: unknown): unknown {
    if (this.isNeoInteger(value)) return this.neoNumber(value);
    if (Array.isArray(value)) return value.map((item) => this.normalizeValue(item));
    if (value && typeof value === "object") {
      const maybeDate = value as { toString?: () => string };
      if (typeof maybeDate.toString === "function" && maybeDate.constructor?.name?.includes("Date")) {
        return maybeDate.toString();
      }
    }
    return value;
  }

  private resolveNodeType(labels: string[]): GraphNodeType {
    if (labels.includes("Document")) return "Document";
    if (labels.includes("Tag")) return "Tag";
    if (labels.includes("Chunk")) return "Chunk";
    return "Entity";
  }

  private nodeRank(node: GraphNodeDto) {
    const typeRank = node.type === "Document" ? 3 : node.type === "Entity" ? 2 : 1;
    return typeRank * 1000 + (node.val || 1);
  }

  private entityTenantPredicate(alias: string) {
    return `((${alias}.tenantId = $tenantId OR (${alias}.tenantId IS NULL AND ${alias}.id STARTS WITH $entityIdPrefix)) AND coalesce(${alias}.mergeStatus, 'ACTIVE') <> 'MERGED')`;
  }

  private relationActivePredicate(alias: string) {
    return `(coalesce(${alias}.status, 'ACTIVE') <> 'DELETED' AND coalesce(${alias}.reviewStatus, 'APPROVED') <> 'REJECTED')`;
  }

  private entityIdPrefix(tenantId: string) {
    return `e-${tenantId}-`;
  }

  private tagNodeId(tagId: string) {
    return `tag-${tagId}`;
  }

  private clampNumber(value: unknown, min: number, max: number, fallback: number) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(numberValue)));
  }

  private neoNumber(value: any) {
    if (this.isNeoInteger(value)) return value.toNumber();
    return Number(value) || 0;
  }

  private numberFromUnknown(value: unknown) {
    if (this.isNeoInteger(value)) return value.toNumber();
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private isNeoInteger(value: unknown): value is { toNumber: () => number } {
    return Boolean(value && typeof value === "object" && "toNumber" in value);
  }

  private currentTenantId() {
    const tenantId = this.db.tenantId;
    if (!tenantId) throw new BadRequestException("缺少租户上下文");
    return tenantId;
  }

  private currentUserId() {
    return this.db.userId || "system";
  }

  private iso(value: unknown) {
    if (!value) return new Date(0).toISOString();
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
  }

  private cleanText(value: unknown, maxLength: number) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    return text.length > maxLength ? text.slice(0, maxLength) : text;
  }

  private stringArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
      } catch {
        return value ? [value] : [];
      }
    }
    return [];
  }
}
