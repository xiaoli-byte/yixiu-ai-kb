import { describe, expect, it } from "vitest";
import { buildGraphExportJson, buildGraphSvg } from "./graphExport";
import type { GraphData } from "@/types/api";

const graph: GraphData = {
  nodes: [
    { id: "a", label: "Alpha", type: "Entity", properties: { type: "Org" } },
    { id: "b", label: "Beta", type: "Entity", properties: { type: "Concept" } },
  ],
  edges: [
    { id: "e1", source: "a", target: "b", label: "RELATED", weight: 1 },
  ],
};

describe("graph export helpers", () => {
  it("builds JSON with filters, layout and metadata", () => {
    const exported = buildGraphExportJson({
      graph,
      filters: { keyword: "Alpha", nodeType: "Entity" },
      centerNodeId: "a",
      savedViewId: "view-1",
    });

    expect(exported.metadata.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(exported.filters.keyword).toBe("Alpha");
    expect(exported.layout.centerNodeId).toBe("a");
    expect(exported.graph.nodes).toHaveLength(2);
  });

  it("builds a non-empty SVG containing nodes and relation labels", () => {
    const svg = buildGraphSvg(graph, { width: 640, height: 360, centerNodeId: "a" });

    expect(svg).toContain("<svg");
    expect(svg).toContain("Alpha");
    expect(svg).toContain("RELATED");
    expect(svg).toContain("</svg>");
  });
});
