import type { DisplayGraph } from "./types";

interface BuildGraphElementStatesArgs {
  display: DisplayGraph;
  hoveredId: string | null;
  highlightNodeIds?: string[];
  highlightEdgeIds?: string[];
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
}

export function buildGraphElementStates({
  display,
  hoveredId,
  highlightNodeIds = [],
  highlightEdgeIds = [],
  selectedNodeId = null,
  selectedEdgeId = null,
}: BuildGraphElementStatesArgs): Record<string, string[]> {
  const states: Record<string, string[]> = {};
  const protectedIds = new Set<string>();

  for (const node of display.nodes) states[node.id] = [];
  for (const edge of display.edges) states[edge.id] = [];

  const addState = (id: string | null | undefined, state: string) => {
    if (!id || !Object.prototype.hasOwnProperty.call(states, id)) return;
    if (!states[id].includes(state)) states[id].push(state);
  };
  const protect = (id: string | null | undefined) => {
    if (!id || !Object.prototype.hasOwnProperty.call(states, id)) return;
    protectedIds.add(id);
  };

  for (const id of highlightNodeIds) {
    protect(id);
    addState(id, "highlighted");
  }
  for (const id of highlightEdgeIds) {
    protect(id);
    addState(id, "highlighted");
  }
  if (selectedNodeId) {
    protect(selectedNodeId);
    addState(selectedNodeId, "selected");
  }
  if (selectedEdgeId) {
    protect(selectedEdgeId);
    addState(selectedEdgeId, "selected");
  }

  if (!hoveredId || !Object.prototype.hasOwnProperty.call(states, hoveredId)) {
    return states;
  }

  const neighborIds = new Set<string>([hoveredId]);
  for (const edge of display.edges) {
    if (edge.source === hoveredId) neighborIds.add(edge.target);
    if (edge.target === hoveredId) neighborIds.add(edge.source);
  }

  addState(hoveredId, "hover");
  for (const id of neighborIds) {
    if (id !== hoveredId) addState(id, "related");
  }
  for (const node of display.nodes) {
    if (!neighborIds.has(node.id) && !protectedIds.has(node.id)) {
      addState(node.id, "dim");
    }
  }
  for (const edge of display.edges) {
    const isHoverEdge = edge.source === hoveredId || edge.target === hoveredId;
    if (isHoverEdge) {
      addState(edge.id, "hover");
    } else if (!protectedIds.has(edge.id)) {
      addState(edge.id, "dim");
    }
  }

  return states;
}
