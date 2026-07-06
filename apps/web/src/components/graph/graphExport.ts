import type { GraphData, GraphExploreQuery } from "@/types/api";

interface ExportJsonInput {
  graph: GraphData;
  filters: Partial<GraphExploreQuery>;
  centerNodeId?: string | null;
  savedViewId?: string | null;
}

interface SvgOptions {
  width?: number;
  height?: number;
  centerNodeId?: string | null;
}

const TYPE_COLORS: Record<string, string> = {
  Document: "#2f7bff",
  Entity: "#22c783",
  Tag: "#8b5cf6",
  Category: "#f59e0b",
  Chunk: "#94a3b8",
};

export function buildGraphExportJson(input: ExportJsonInput) {
  return {
    metadata: {
      exportedAt: new Date().toISOString(),
      nodeCount: input.graph.nodes.length,
      edgeCount: input.graph.edges.length,
      savedViewId: input.savedViewId || null,
    },
    filters: input.filters,
    layout: {
      centerNodeId: input.centerNodeId || null,
    },
    graph: input.graph,
  };
}

export function buildGraphSvg(graph: GraphData, options: SvgOptions = {}) {
  const width = options.width || 1200;
  const height = options.height || 800;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(120, Math.min(width, height) * 0.34);
  const nodes = positionNodes(graph, centerX, centerY, radius, options.centerNodeId || undefined);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const edgeMarkup = graph.edges
    .map((edge) => {
      const source = nodeById.get(String(edge.source));
      const target = nodeById.get(String(edge.target));
      if (!source || !target) return "";
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      return `<g><line x1="${round(source.x)}" y1="${round(source.y)}" x2="${round(target.x)}" y2="${round(target.y)}" stroke="#94a3b8" stroke-width="${Math.max(1, Math.min(4, edge.weight || 1))}" marker-end="url(#arrow)" /><text x="${round(midX)}" y="${round(midY - 4)}" text-anchor="middle" font-size="11" fill="#475569">${escapeXml(edge.label)}</text></g>`;
    })
    .join("");

  const nodeMarkup = nodes
    .map((node) => {
      const color = TYPE_COLORS[node.type] || TYPE_COLORS.Entity;
      return `<g><circle cx="${round(node.x)}" cy="${round(node.y)}" r="${node.isCenter ? 24 : 18}" fill="${color}" stroke="#ffffff" stroke-width="2" /><text x="${round(node.x)}" y="${round(node.y + (node.isCenter ? 40 : 34))}" text-anchor="middle" font-size="12" font-weight="${node.isCenter ? 700 : 500}" fill="#0f172a">${escapeXml(trimLabel(node.label, 24))}</text></g>`;
    })
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Knowledge graph export">`,
    `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8" /></marker></defs>`,
    `<rect width="100%" height="100%" fill="#ffffff" />`,
    edgeMarkup,
    nodeMarkup,
    `</svg>`,
  ].join("");
}

function positionNodes(
  graph: GraphData,
  centerX: number,
  centerY: number,
  radius: number,
  centerNodeId?: string,
) {
  const sorted = [...graph.nodes];
  const centerIndex = centerNodeId ? sorted.findIndex((node) => node.id === centerNodeId) : -1;
  if (centerIndex > 0) {
    const [center] = sorted.splice(centerIndex, 1);
    sorted.unshift(center);
  }
  if (sorted.length === 1) {
    return [{ ...sorted[0], x: centerX, y: centerY, isCenter: true }];
  }
  return sorted.map((node, index) => {
    if (index === 0) return { ...node, x: centerX, y: centerY, isCenter: true };
    const angle = -Math.PI / 2 + ((index - 1) * Math.PI * 2) / Math.max(1, sorted.length - 1);
    return {
      ...node,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      isCenter: false,
    };
  });
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function trimLabel(label: string, max: number) {
  return label.length > max ? `${label.slice(0, max - 1)}...` : label;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
