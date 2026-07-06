import type { GraphData, GraphEdge, GraphNode } from "@/types/api";

export type GraphNodeType = GraphNode["type"];

export interface KnowledgeGraphProps {
  graph: GraphData;
  loading?: boolean;
  error?: string;

  centerNodeId?: string;
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
  highlightNodeIds?: string[];
  highlightEdgeIds?: string[];
  maxNodes?: number;
  maxEdges?: number;
  onCenterChange?: (nodeId: string) => void;
  onExpand?: (nodeId: string) => void;
  onNodeSelect?: (nodeId: string) => void;
  onEdgeSelect?: (edgeId: string) => void;
}

export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  layer: 0 | 1 | 2;
  rank: number;
  isCenter: boolean;
}

export interface DisplayNode {
  id: string;
  data: {
    label: string;
    type: GraphNodeType;
    isCenter: boolean;
    layer: 0 | 1 | 2;
  };
  style: Record<string, unknown>;
}

export interface DisplayEdge {
  id: string;
  source: string;
  target: string;
  data: {
    label: string;
    isFirstHop: boolean;
  };
  style: Record<string, unknown>;
}

export interface DisplayGraph {
  nodes: DisplayNode[];
  edges: DisplayEdge[];
  centerId: string | null;
}

export interface GraphInteractionHandlers {
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
  onDblClick: (id: string) => void;
  onEdgeClick?: (id: string) => void;
}

export type { GraphData, GraphEdge, GraphNode };
