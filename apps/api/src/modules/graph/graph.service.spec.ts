import { describe, expect, it, vi } from "vitest";
import { GraphService } from "./graph.service";

function createService() {
  const db = {
    tenantId: "tenant-1",
    userId: "user-1",
    query: vi.fn(),
    queryOne: vi.fn(),
  };
  const neo4j = {
    runRead: vi.fn(),
    run: vi.fn(),
  };
  return {
    service: new GraphService(neo4j as any, db as any),
    db,
    neo4j,
  };
}

describe("GraphService governance additions", () => {
  it("returns relation evidence with document and chunk context", async () => {
    const { service, db } = createService();
    db.queryOne.mockResolvedValueOnce({
      id: "edge-1",
      relation_type: "RELATED",
      source_node_id: "node-a",
      target_node_id: "node-b",
      weight: 2,
      evidence_count: 1,
      source_count: 1,
      updated_at: new Date("2026-07-01T00:00:00Z"),
      review_status: "APPROVED",
      status: "ACTIVE",
      source_type: "AI",
      source_name: "Alpha",
      target_name: "Beta",
    });
    db.query.mockResolvedValueOnce([
      {
        id: "ev-1",
        document_content_id: "content-1",
        document_id: "doc-1",
        chunk_id: "chunk-1",
        evidence_text: "Alpha relates to Beta",
        confidence: 0.82,
        created_at: new Date("2026-07-01T00:00:00Z"),
        document_title: "Evidence doc",
        chunk_idx: 3,
        page: 2,
      },
    ]);

    const evidence = await service.edgeEvidence("edge-1");

    expect(evidence.edge.id).toBe("edge-1");
    expect(evidence.edge.reviewStatus).toBe("APPROVED");
    expect(evidence.evidences).toEqual([
      expect.objectContaining({
        id: "ev-1",
        documentTitle: "Evidence doc",
        chunkId: "chunk-1",
        chunkIdx: 3,
        confidence: 0.82,
      }),
    ]);
  });

  it("maps shortest path results and hydrates edge evidence summaries", async () => {
    const { service, db, neo4j } = createService();
    neo4j.runRead.mockResolvedValueOnce({
      records: [
        {
          get: (key: string) => {
            if (key === "nodes") {
              return [
                { labels: ["Entity"], identity: { toNumber: () => 1 }, properties: { id: "node-a", name: "Alpha" } },
                { labels: ["Entity"], identity: { toNumber: () => 2 }, properties: { id: "node-b", name: "Beta" } },
              ];
            }
            return [
              {
                id: "edge-1",
                source: { toNumber: () => 1 },
                target: { toNumber: () => 2 },
                type: "RELATES_TO",
                properties: { edgeId: "edge-1", type: "RELATED", weight: 1 },
              },
            ];
          },
        },
      ],
    });
    db.query.mockResolvedValueOnce([
      {
        edge_id: "edge-1",
        evidence_count: "2",
        document_titles: ["Evidence doc"],
        max_confidence: 0.9,
      },
    ]);

    const path = await service.shortestPath({ sourceId: "node-a", targetId: "node-b", maxDepth: 3 });

    expect(path.found).toBe(true);
    expect(path.graph.edges[0]).toEqual(
      expect.objectContaining({
        id: "edge-1",
        evidenceSummary: expect.objectContaining({ evidenceCount: 2, maxConfidence: 0.9 }),
      }),
    );
  });

  it("saves graph views scoped to tenant and current user", async () => {
    const { service, db } = createService();
    db.queryOne.mockResolvedValueOnce({
      id: "view-1",
      name: "客户知识",
      description: "客户相关知识网络",
      tenant_id: "tenant-1",
      user_id: "user-1",
      visibility: "PRIVATE",
      filters: { nodeType: "Entity" },
      layout: { centerNodeId: "node-a" },
      created_at: new Date("2026-07-01T00:00:00Z"),
      updated_at: new Date("2026-07-01T00:00:00Z"),
    });

    const view = await service.saveView({
      name: "客户知识",
      description: "客户相关知识网络",
      visibility: "PRIVATE",
      filters: { nodeType: "Entity" },
      layout: { centerNodeId: "node-a" },
    });

    expect(view).toEqual(
      expect.objectContaining({
        id: "view-1",
        userId: "user-1",
        filters: { nodeType: "Entity" },
      }),
    );
    expect(db.queryOne).toHaveBeenCalledWith(expect.stringContaining("knowledge_graph_views"), expect.any(Array));
  });

  it("soft merges an entity and writes an audit record", async () => {
    const { service, db, neo4j } = createService();
    db.queryOne
      .mockResolvedValueOnce({ id: "node-source", name: "Alpha Ltd", aliases: ["Alpha Ltd"] })
      .mockResolvedValueOnce({ id: "node-target", name: "Alpha", aliases: ["Alpha"] })
      .mockResolvedValueOnce({
        id: "node-target",
        name: "Alpha",
        type: "Org",
        aliases: ["Alpha", "Alpha Ltd"],
        source_count: 1,
        mention_count: 1,
        merge_status: "ACTIVE",
        merged_into_node_id: null,
        updated_at: new Date("2026-07-01T00:00:00Z"),
      });
    db.query.mockResolvedValue([]);
    neo4j.run.mockResolvedValue({});

    await service.mergeEntity("node-source", {
      targetNodeId: "node-target",
      aliases: ["Alpha Ltd"],
      reason: "重复实体",
    });

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE knowledge_nodes"), expect.any(Array));
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("knowledge_graph_changes"), expect.any(Array));
    expect(neo4j.run).toHaveBeenCalledWith(expect.stringContaining("SET source.mergeStatus='MERGED'"), expect.any(Object));
  });
});
