import { Injectable } from "@nestjs/common";
import { Neo4jService } from "../../database/neo4j/neo4j.service";
import { DatabaseService } from "../../database/database.service";

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
}

interface GraphDataDto {
  nodes: GraphNodeDto[];
  edges: GraphEdgeDto[];
}

interface GraphExploreOptions {
  keyword?: string;
  nodeType?: ExploreNodeType;
  categoryId?: string;
  createdFrom?: string;
  createdTo?: string;
  limit?: number;
  depth?: number;
}

interface NormalizedGraphExploreOptions {
  keyword?: string;
  nodeType: ExploreNodeType;
  categoryId?: string;
  createdFrom?: string;
  createdTo?: string;
  limit: number;
  depth: number;
}

interface GraphCategoryDto {
  id: string;
  name: string;
  type?: string;
  documentCount: number;
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
        }),
      );
    }

    const graph = await this.enrichGraph(
      this.limitGraph(this.mergeGraphs(graphParts), normalized.limit),
      tenantId,
      normalized,
    );
    const limitedGraph = this.limitGraph(graph, normalized.limit);

    return {
      graph: limitedGraph,
      stats: this.buildStats(limitedGraph, categories.length),
      topNodes: await this.listTopEntities(tenantId, 5),
      recentNodes: await this.listRecentNodes(tenantId, 6),
      categories,
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
    const graph = await this.queryDocumentGraph({
      tenantId,
      documentIds: [documentId],
      depth: 2,
      limit: 80,
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
        limit: safeLimit,
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

  private async resolveDocumentSeedIds(
    tenantId: string,
    opts: NormalizedGraphExploreOptions,
  ): Promise<string[]> {
    const where: any = { tenantId };
    const createdAt = this.buildDateRange(opts.createdFrom, opts.createdTo);
    if (createdAt) where.createdAt = createdAt;
    if (opts.categoryId) {
      where.tags = { some: { tagId: opts.categoryId } };
    }

    const keyword = opts.keyword?.trim();
    if (keyword && (opts.nodeType === "all" || opts.nodeType === "Document")) {
      where.OR = [
        { title: { contains: keyword, mode: "insensitive" } },
        { tags: { some: { tag: { name: { contains: keyword, mode: "insensitive" } } } } },
      ];
    } else if (keyword && opts.nodeType === "Tag") {
      where.tags = {
        some: {
          tag: {
            ...(opts.categoryId ? { id: opts.categoryId } : {}),
            name: { contains: keyword, mode: "insensitive" },
          },
        },
      };
    }

    const shouldQueryDocuments =
      opts.nodeType === "Document" ||
      opts.nodeType === "Tag" ||
      Boolean(opts.categoryId || opts.createdFrom || opts.createdTo) ||
      Boolean(keyword && opts.nodeType === "all");

    if (!shouldQueryDocuments) return [];

    const documents = await this.db.prisma.document.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: opts.limit,
      select: { id: true },
    });
    return documents.map((document) => document.id);
  }

  private async queryDocumentGraph(opts: {
    tenantId: string;
    documentIds: string[];
    depth: number;
    limit: number;
  }): Promise<GraphDataDto> {
    if (opts.documentIds.length === 0) return { nodes: [], edges: [] };

    const result = await this.neo4j.runRead(
      `
        MATCH (d:Document)
        WHERE d.tenantId = $tenantId AND d.id IN $documentIds
        OPTIONAL MATCH (d)-[contains:CONTAINS_ENTITY]->(e:Entity)
        WHERE e IS NULL OR ${this.entityTenantPredicate("e")}
        OPTIONAL MATCH (e)-[related:RELATES_TO]-(neighbor:Entity)
        WHERE $depth >= 2 AND ${this.entityTenantPredicate("neighbor")}
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
      },
    );

    return this.mapGraphRecords(result.records, opts.limit);
  }

  private async queryEntityGraph(opts: {
    tenantId: string;
    keyword?: string;
    depth: number;
    limit: number;
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
        OPTIONAL MATCH (seed)<-[:CONTAINS_ENTITY]-(seedDoc:Document {tenantId: $tenantId})
        WITH seed, count(DISTINCT seedDoc) AS documentCount
        ORDER BY documentCount DESC, coalesce(seed.updatedAt, seed.createdAt, "") DESC
        LIMIT $seedLimit
        OPTIONAL MATCH (d:Document {tenantId: $tenantId})-[contains:CONTAINS_ENTITY]->(seed)
        OPTIONAL MATCH (seed)-[related:RELATES_TO]-(neighbor:Entity)
        WHERE $depth >= 2 AND ${this.entityTenantPredicate("neighbor")}
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
        seedLimit,
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
      const documents = await this.db.prisma.document.findMany({
        where: { tenantId, id: { in: documentIds } },
        include: { tags: { include: { tag: true } } },
      });
      const documentMap = new Map(documents.map((document) => [document.id, document]));

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
            createdAt: document.createdAt.toISOString(),
            updatedAt: document.updatedAt.toISOString(),
            categories: document.tags.map((item) => ({
              id: item.tag.id,
              name: item.tag.name,
            })),
          },
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
    const documentIds = graph.nodes
      .filter((node) => node.type === "Document")
      .map((node) => node.id);
    if (documentIds.length === 0) return graph;

    const tagLinks = await this.db.prisma.documentTag.findMany({
      where: {
        documentId: { in: documentIds },
        document: { tenantId },
        ...(opts.categoryId ? { tagId: opts.categoryId } : {}),
        ...(opts.keyword && opts.nodeType === "Tag"
          ? { tag: { name: { contains: opts.keyword, mode: "insensitive" } } }
          : {}),
      },
      include: { tag: true },
    });

    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));

    for (const link of tagLinks) {
      const tagNodeId = this.tagNodeId(link.tag.id);
      if (!nodes.has(tagNodeId)) {
        nodes.set(tagNodeId, {
          id: tagNodeId,
          label: link.tag.name,
          type: "Tag",
          properties: {
            tagId: link.tag.id,
            name: link.tag.name,
            type: link.tag.type,
          },
          val: 1,
        });
      }

      const edgeId = `document-tag-${link.documentId}-${link.tag.id}`;
      if (!edges.has(edgeId)) {
        edges.set(edgeId, {
          id: edgeId,
          source: link.documentId,
          target: tagNodeId,
          label: "标签",
          properties: { relationType: "DOCUMENT_TAG", tagId: link.tag.id },
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
        SELECT t.id, t.name, t.type, COUNT(DISTINCT dt.document_id) AS document_count
        FROM tags t
        JOIN document_tags dt ON dt.tag_id = t.id
        JOIN documents d ON d.id = dt.document_id
        WHERE d.tenant_id = $1
        GROUP BY t.id, t.name, t.type
        ORDER BY document_count DESC, t.name ASC
      `,
      [tenantId],
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      documentCount: Number(row.document_count) || 0,
    }));
  }

  private async listRecentNodes(tenantId: string, limit: number) {
    const documents = await this.db.prisma.document.findMany({
      where: { tenantId },
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: { tags: { include: { tag: true } } },
    });

    return documents.map((document) => ({
      id: document.id,
      label: document.title,
      type: "Document" as const,
      properties: {
        title: document.title,
        mime: document.mime,
        status: document.status,
      },
      val: 1,
      updatedAt: document.updatedAt.toISOString(),
      categoryNames: document.tags.map((item) => item.tag.name),
    }));
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
      const edge: GraphEdgeDto = {
        id: String(raw.id),
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
      categoryId: opts.categoryId || undefined,
      createdFrom: opts.createdFrom || undefined,
      createdTo: opts.createdTo || undefined,
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
    return `(${alias}.tenantId = $tenantId OR (${alias}.tenantId IS NULL AND ${alias}.id STARTS WITH $entityIdPrefix))`;
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
}
