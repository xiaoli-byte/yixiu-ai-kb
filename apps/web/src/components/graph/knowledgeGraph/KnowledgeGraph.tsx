"use client";

import {
  Maximize2,
  Minus,
  Network,
  Plus,
  ScanLine,
} from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { bindGraphEvents } from "./graphEvents";
import { buildDisplayGraph } from "./graphLayout";
import { LEGEND_ITEMS } from "./style";
import type {
  DisplayGraph,
  GraphInteractionHandlers,
  KnowledgeGraphProps,
} from "./types";

export interface GraphCanvasHandle {
  fit: () => Promise<void> | void;
  exportPng: () => Promise<boolean>;
}

interface G6GraphInstance {
  destroy: () => void;
  setData: (data: unknown) => void;
  render: () => Promise<void>;
  fitView: (options?: unknown, animation?: unknown) => Promise<void>;
  zoomBy: (ratio: number, animation?: unknown) => Promise<void>;
  getZoom: () => number;
  resize: (width?: number, height?: number) => void;
  toDataURL: (options?: unknown) => Promise<string>;
  setElementState: (states: Record<string, string[]>, drawOnce?: boolean) => void;
}

const DBLCLICK_DEBOUNCE_MS = 300;
const DEFAULT_MIN_WIDTH = 320;
const DEFAULT_MIN_HEIGHT = 360;

export const KnowledgeGraph = forwardRef<GraphCanvasHandle, KnowledgeGraphProps>(
  function KnowledgeGraph(props, ref) {
    const {
      graph,
      loading,
      error,
      centerNodeId,
      selectedNodeId = null,
      selectedEdgeId = null,
      highlightNodeIds = [],
      highlightEdgeIds = [],
      maxNodes,
      maxEdges,
      onCenterChange,
      onExpand,
      onNodeSelect,
      onEdgeSelect,
    } = props;

    const shellRef = useRef<HTMLElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const graphRef = useRef<G6GraphInstance | null>(null);
    const unbindRef = useRef<(() => void) | null>(null);
    const lastInteractionAt = useRef(0);
    const [centerId, setCenterId] = useState<string | undefined>(centerNodeId);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [size, setSize] = useState({ width: 900, height: 620 });
    const [zoomLabel, setZoomLabel] = useState("100%");

    useEffect(() => {
      if (centerNodeId !== undefined) setCenterId(centerNodeId);
    }, [centerNodeId]);

    useEffect(() => {
      if (!shellRef.current) return;
      const update = () => {
        const element = shellRef.current;
        if (!element) return;
        const next = {
          width: Math.max(DEFAULT_MIN_WIDTH, Math.floor(element.clientWidth)),
          height: Math.max(DEFAULT_MIN_HEIGHT, Math.floor(element.clientHeight)),
        };
        setSize((current) =>
          current.width === next.width && current.height === next.height
            ? current
            : next,
        );
      };
      update();
      const observer = new ResizeObserver(update);
      observer.observe(shellRef.current);
      return () => observer.disconnect();
    }, []);

    const display: DisplayGraph = useMemo(
      () =>
        buildDisplayGraph(graph, centerId, size.width, size.height, {
          maxNodes,
          maxEdges,
        }),
      [graph, centerId, maxNodes, maxEdges, size.width, size.height],
    );

    const handlers: GraphInteractionHandlers = useMemo(
      () => ({
        onHover: (id) => setHoveredId(id),
        onClick: (id) => {
          if (Date.now() - lastInteractionAt.current < DBLCLICK_DEBOUNCE_MS) {
            return;
          }
          onNodeSelect?.(id);
          if (id === centerId) return;
          setCenterId(id);
          onCenterChange?.(id);
        },
        onDblClick: (id) => {
          lastInteractionAt.current = Date.now();
          onExpand?.(id);
        },
        onEdgeClick: (id) => onEdgeSelect?.(id),
      }),
      [centerId, onCenterChange, onEdgeSelect, onExpand, onNodeSelect],
    );

    useEffect(() => {
      let disposed = false;
      let unbind: (() => void) | null = null;

      async function mountOrUpdate(): Promise<() => void> {
        const canvas = canvasRef.current;
        if (!canvas || display.nodes.length === 0) return () => {};

        if (!graphRef.current) {
          const { Graph } = await import("@antv/g6");
          if (disposed || !canvasRef.current) return () => {};
          graphRef.current = new Graph({
            container: canvasRef.current,
            width: size.width,
            height: size.height,
            autoFit: "view",
            animation: false,
            data: toG6Data(display),
            node: {
              type: "circle",
              style: (datum: unknown) =>
                (datum as { style?: Record<string, unknown> }).style ?? {},
              state: {
                hover: { lineWidth: 4, halo: true, haloStrokeOpacity: 0.4 },
                related: { lineWidth: 3 },
                highlighted: { lineWidth: 4, stroke: "#0ea5e9" },
                selected: { lineWidth: 5, stroke: "#0f172a", halo: true, haloStrokeOpacity: 0.3 },
                dim: { opacity: 0.18 },
              },
            },
            edge: {
              type: "line",
              style: (datum: unknown) =>
                (datum as { style?: Record<string, unknown> }).style ?? {},
              state: {
                hover: { lineWidth: 3, stroke: "#475569" },
                related: { lineWidth: 2.4, stroke: "#64748b" },
                highlighted: { lineWidth: 3, stroke: "#0ea5e9" },
                selected: { lineWidth: 3.4, stroke: "#0f172a" },
                dim: { opacity: 0.12 },
              },
            },
            behaviors: ["drag-canvas", "zoom-canvas", "drag-element"],
            layout: { type: "preset" },
          }) as G6GraphInstance;
        } else {
          graphRef.current.resize(size.width, size.height);
          graphRef.current.setData(toG6Data(display));
        }

        unbind = bindGraphEvents(
          graphRef.current as unknown as Parameters<typeof bindGraphEvents>[0],
          handlers,
        );
        await graphRef.current.render();
        await graphRef.current.fitView(
          { padding: [80, 80, 120, 80] },
          { duration: 280 },
        );
        if (!disposed) setZoomLabel(formatZoom(graphRef.current.getZoom()));
        return unbind ?? (() => {});
      }

      void mountOrUpdate().then((dispose) => {
        if (disposed) {
          dispose();
          return;
        }
        unbindRef.current = dispose;
      });

      return () => {
        disposed = true;
        unbindRef.current?.();
        unbindRef.current = null;
      };
    }, [display, size, handlers]);

    useEffect(() => {
      const instance = graphRef.current;
      if (!instance || display.nodes.length === 0) return;

      const states: Record<string, string[]> = {};
      const protectedIds = new Set<string>();
      const addState = (id: string | null | undefined, state: string) => {
        if (!id) return;
        states[id] = states[id] ?? [];
        if (!states[id].includes(state)) states[id].push(state);
      };

      for (const id of highlightNodeIds) {
        protectedIds.add(id);
        addState(id, "highlighted");
      }
      for (const id of highlightEdgeIds) {
        protectedIds.add(id);
        addState(id, "highlighted");
      }
      if (selectedNodeId) {
        protectedIds.add(selectedNodeId);
        addState(selectedNodeId, "selected");
      }
      if (selectedEdgeId) {
        protectedIds.add(selectedEdgeId);
        addState(selectedEdgeId, "selected");
      }

      if (!hoveredId) {
        instance.setElementState(states, true);
        return;
      }

      const neighborIds = new Set<string>([hoveredId]);
      for (const edge of display.edges) {
        if (edge.source === hoveredId) neighborIds.add(edge.target);
        if (edge.target === hoveredId) neighborIds.add(edge.source);
      }

      addState(hoveredId, "hover");
      for (const id of neighborIds) {
        if (id === hoveredId) continue;
        addState(id, "related");
      }
      for (const node of display.nodes) {
        if (!neighborIds.has(node.id) && !protectedIds.has(node.id)) {
          addState(node.id, "dim");
        }
      }
      for (const edge of display.edges) {
        const isHoverEdge =
          edge.source === hoveredId || edge.target === hoveredId;
        if (isHoverEdge) {
          addState(edge.id, "hover");
        } else if (!protectedIds.has(edge.id)) {
          addState(edge.id, "dim");
        }
      }
      instance.setElementState(states, true);
    }, [hoveredId, display, highlightNodeIds, highlightEdgeIds, selectedNodeId, selectedEdgeId]);

    useEffect(
      () => () => {
        unbindRef.current?.();
        unbindRef.current = null;
        graphRef.current?.destroy();
        graphRef.current = null;
      },
      [],
    );

    useImperativeHandle(
      ref,
      () => ({
        async fit() {
          const instance = graphRef.current;
          if (!instance) return;
          await instance.fitView(
            { padding: [80, 80, 120, 80] },
            { duration: 280 },
          );
        },
        async exportPng() {
          const instance = graphRef.current;
          if (!instance || display.nodes.length === 0) return false;
          try {
            const link = document.createElement("a");
            link.download = `knowledge-graph-${new Date().toISOString().slice(0, 10)}.png`;
            link.href = await instance.toDataURL();
            link.click();
            return true;
          } catch {
            return false;
          }
        },
      }),
      [display.nodes.length],
    );

    const zoomBy = async (ratio: number) => {
      const instance = graphRef.current;
      if (!instance) return;
      await instance.zoomBy(ratio, { duration: 220 });
      setZoomLabel(formatZoom(instance.getZoom()));
    };

    const toggleFullscreen = () => {
      const element = shellRef.current;
      if (!element) return;
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void element.requestFullscreen();
      }
    };

    return (
      <section
        ref={shellRef}
        className="relative h-[560px] overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-soft xl:h-[calc(100vh-180px)] xl:min-h-[520px]"
      >
        {display.nodes.length === 0 ? (
          <EmptyGraphState loading={loading} error={error} />
        ) : (
          <div ref={canvasRef} className="h-full w-full" />
        )}

        {loading && display.nodes.length > 0 && (
          <div className="absolute inset-0 bg-white/45 backdrop-blur-[1px]" />
        )}

        <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm">
          {LEGEND_ITEMS.map((item) => (
            <LegendDot key={item.type} color={item.color} label={item.label} />
          ))}
          <span className="mx-1 h-4 w-px bg-slate-200" />
          <span className="inline-flex items-center gap-2">
            <span className="h-px w-8 bg-slate-300" />
            关联
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-px w-8 border-t border-dashed border-slate-300" />
            标签
          </span>
        </div>

        <div className="absolute bottom-4 right-4 flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white/95 shadow-sm">
          <IconButton
            label="适配视图"
            onClick={() => void fitGraph(graphRef.current)}
          >
            <ScanLine size={16} />
          </IconButton>
          <IconButton label="缩小" onClick={() => void zoomBy(0.84)}>
            <Minus size={16} />
          </IconButton>
          <div className="border-x border-slate-200 px-3 py-2 text-xs font-medium tabular-nums text-slate-600">
            {zoomLabel}
          </div>
          <IconButton label="放大" onClick={() => void zoomBy(1.18)}>
            <Plus size={16} />
          </IconButton>
          <IconButton label="全屏" onClick={toggleFullscreen}>
            <Maximize2 size={16} />
          </IconButton>
        </div>
      </section>
    );
  },
);

function EmptyGraphState({
  loading,
  error,
}: {
  loading?: boolean;
  error?: string;
}) {
  return (
    <div className="absolute inset-0 grid place-items-center px-6 text-center text-slate-400">
      <div>
        <Network className="mx-auto mb-3 text-slate-300" size={42} />
        <div className="text-sm font-medium text-slate-500">
          {loading ? "图谱加载中" : error || "暂无图谱数据"}
        </div>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="grid h-9 w-9 place-items-center text-slate-500 transition hover:bg-slate-50 hover:text-brand-600"
      title={label}
      aria-label={label}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function toG6Data(display: DisplayGraph) {
  return {
    nodes: display.nodes.map((node) => ({
      id: node.id,
      type: "circle",
      data: node.data,
      style: node.style,
    })),
    edges: display.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      data: edge.data,
      style: edge.style,
    })),
  };
}

async function fitGraph(instance: G6GraphInstance | null) {
  if (!instance) return;
  await instance.fitView(
    { padding: [80, 80, 120, 80] },
    { duration: 280 },
  );
}

function formatZoom(value: number) {
  if (!Number.isFinite(value)) return "100%";
  return `${Math.round(value * 100)}%`;
}
