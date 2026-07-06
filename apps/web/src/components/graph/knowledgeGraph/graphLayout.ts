import type { GraphData, GraphEdge, GraphNode } from "@/types/api";
import { getEdgeStyle, getNodeStyle } from "./style";
import type {
  DisplayEdge,
  DisplayGraph,
  DisplayNode,
  PositionedNode,
} from "./types";

const DEFAULT_MAX_NODES = 32;
const DEFAULT_MAX_EDGES = 48;
const TYPE_PRIORITY: Record<string, number> = {
  Document: 5,
  Entity: 4,
  Tag: 3,
  Category: 2,
  Chunk: 1,
};

export function buildDisplayGraph(
  input: GraphData,
  preferredCenterId: string | undefined,
  width: number,
  height: number,
  options: { maxNodes?: number; maxEdges?: number } = {},
): DisplayGraph {
  if (input.nodes.length === 0) {
    return { nodes: [], edges: [], centerId: null };
  }

  const maxNodes = clamp(options.maxNodes ?? DEFAULT_MAX_NODES, 5, 60);
  const maxEdges = clamp(options.maxEdges ?? DEFAULT_MAX_EDGES, 5, 120);

  const nodeById = new Map<string, GraphNode>();
  for (const node of input.nodes) nodeById.set(node.id, node);

  const center = pickCenter(input, preferredCenterId);
  const adjacency = buildAdjacency(input.edges);
  const layers = bfsLayers(center.id, adjacency, 2);

  const { layer1, layer2 } = applyLayerQuota(layers.layer1, layers.layer2, maxNodes);

  const cx = width / 2;
  const cy = height / 2;
  const minDimension = Math.max(120, Math.min(width, height));
  const r1 = minDimension * 0.20;
  const r2 = minDimension * 0.38;

  const positioned = new Map<string, PositionedNode>();
  positioned.set(center.id, {
    ...center,
    x: cx,
    y: cy,
    layer: 0,
    rank: 0,
    isCenter: true,
  });

  const sortedL1 = sortByTypeAndWeight(layer1, adjacency, nodeById);
  const sortedL2 = sortByTypeAndWeight(layer2, adjacency, nodeById);
  distributeOnArc(sortedL1, cx, cy, r1, 1, positioned, nodeById);
  distributeOnArc(sortedL2, cx, cy, r2, 2, positioned, nodeById);

  const selectedIds = new Set(positioned.keys());
  const edges = collectEdges(input.edges, selectedIds, center.id, maxEdges);

  const displayNodes: DisplayNode[] = [];
  for (const node of positioned.values()) {
    displayNodes.push({
      id: node.id,
      data: {
        label: node.label,
        type: node.type,
        isCenter: node.isCenter,
        layer: node.layer,
      },
      style: getNodeStyle(node),
    });
  }

  return {
    nodes: displayNodes,
    edges,
    centerId: center.id,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pickCenter(input: GraphData, preferred: string | undefined): GraphNode {
  if (preferred) {
    const found = input.nodes.find((n) => n.id === preferred);
    if (found) return found;
  }
  const adjacency = buildAdjacency(input.edges);
  const sorted = [...input.nodes].sort(
    (a, b) => nodeWeight(b, adjacency) - nodeWeight(a, adjacency),
  );
  return sorted[0];
}

function buildAdjacency(edges: GraphEdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const edge of edges) {
    const source = String(edge.source);
    const target = String(edge.target);
    if (!adj.has(source)) adj.set(source, new Set());
    if (!adj.has(target)) adj.set(target, new Set());
    adj.get(source)!.add(target);
    adj.get(target)!.add(source);
  }
  return adj;
}

function nodeWeight(node: GraphNode, adjacency: Map<string, Set<string>>) {
  const typeBoost = (TYPE_PRIORITY[node.type] ?? 1) * 100;
  const degree = adjacency.get(node.id)?.size ?? 0;
  return typeBoost + degree * 10 + (node.val ?? 0);
}

function bfsLayers(
  startId: string,
  adjacency: Map<string, Set<string>>,
  maxDepth: number,
): { layer0: string[]; layer1: string[]; layer2: string[] } {
  const layer0: string[] = [startId];
  const layer1: string[] = [];
  const layer2: string[] = [];
  const visited = new Set<string>([startId]);

  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;
    const neighbors = adjacency.get(id) ?? new Set();
    for (const next of neighbors) {
      if (visited.has(next)) continue;
      visited.add(next);
      if (depth + 1 === 1) layer1.push(next);
      else if (depth + 1 === 2) layer2.push(next);
      queue.push({ id: next, depth: depth + 1 });
    }
  }

  return { layer0, layer1, layer2 };
}

function applyLayerQuota(
  layer1: string[],
  layer2: string[],
  maxNodes: number,
): { layer1: string[]; layer2: string[] } {
  const budget = maxNodes - 1;
  const l1Budget = Math.min(layer1.length, Math.ceil(budget * 0.55));
  const l2Budget = Math.min(layer2.length, budget - l1Budget);
  return { layer1: layer1.slice(0, l1Budget), layer2: layer2.slice(0, l2Budget) };
}

function sortByTypeAndWeight(
  ids: string[],
  adjacency: Map<string, Set<string>>,
  nodeById: Map<string, GraphNode>,
): string[] {
  return [...ids].sort((a, b) => {
    const pa = TYPE_PRIORITY[nodeById.get(a)?.type ?? ""] ?? 0;
    const pb = TYPE_PRIORITY[nodeById.get(b)?.type ?? ""] ?? 0;
    if (pa !== pb) return pb - pa;
    return (adjacency.get(b)?.size ?? 0) - (adjacency.get(a)?.size ?? 0);
  });
}

function distributeOnArc(
  ids: string[],
  cx: number,
  cy: number,
  radius: number,
  layer: 1 | 2,
  positioned: Map<string, PositionedNode>,
  nodeById: Map<string, GraphNode>,
) {
  if (ids.length === 0) return;
  const total = ids.length;
  const startAngle = -Math.PI / 2;
  ids.forEach((id, index) => {
    const angle = startAngle + (Math.PI * 2 * index) / total;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    const node = nodeById.get(id);
    if (!node) return;
    positioned.set(id, {
      ...node,
      x,
      y,
      layer,
      rank: index,
      isCenter: false,
    });
  });
}

function collectEdges(
  edges: GraphEdge[],
  selectedIds: Set<string>,
  centerId: string,
  maxEdges: number,
): DisplayEdge[] {
  const result: DisplayEdge[] = [];
  const sorted = [...edges].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  for (const edge of sorted) {
    if (result.length >= maxEdges) break;
    if (!selectedIds.has(String(edge.source))) continue;
    if (!selectedIds.has(String(edge.target))) continue;
    const isFirstHop =
      String(edge.source) === centerId || String(edge.target) === centerId;
    result.push({
      id: edge.id,
      source: String(edge.source),
      target: String(edge.target),
      data: { label: edge.label, isFirstHop },
      style: getEdgeStyle({
        isFirstHop,
        weight: edge.weight,
        label: edge.label,
      }),
    });
  }
  return result;
}
