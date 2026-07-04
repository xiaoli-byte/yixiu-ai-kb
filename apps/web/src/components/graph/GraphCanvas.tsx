"use client";

import dynamic from "next/dynamic";
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
import type { GraphData, GraphNode } from "@/types/api";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false }) as any;

export interface GraphCanvasHandle {
  exportPng: () => boolean;
  fit: () => void;
}

interface GraphCanvasProps {
  graph: GraphData;
  loading?: boolean;
  error?: string;
}

const nodeColors: Record<GraphNode["type"], string> = {
  Document: "#2f7bff",
  Chunk: "#94a3b8",
  Entity: "#22c783",
  Tag: "#8b5cf6",
};

const nodeGlyph: Record<GraphNode["type"], string> = {
  Document: "文",
  Chunk: "段",
  Entity: "知",
  Tag: "标",
};

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(
  function GraphCanvas({ graph, loading, error }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const graphRef = useRef<any>(null);
    const [size, setSize] = useState({ width: 900, height: 620 });

    useEffect(() => {
      if (!containerRef.current) return;

      const update = () => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setSize({
          width: Math.max(320, Math.floor(rect.width)),
          height: Math.max(360, Math.floor(rect.height)),
        });
      };

      update();
      const observer = new ResizeObserver(update);
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }, []);

    const graphData = useMemo(
      () => ({
        nodes: graph.nodes.map((node) => ({ ...node })),
        links: graph.edges.map((edge) => ({ ...edge })),
      }),
      [graph],
    );

    useImperativeHandle(
      ref,
      () => ({
        exportPng() {
          const canvas = containerRef.current?.querySelector("canvas");
          if (!canvas || graph.nodes.length === 0) return false;

          try {
            const link = document.createElement("a");
            link.download = `knowledge-graph-${new Date().toISOString().slice(0, 10)}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
            return true;
          } catch {
            return false;
          }
        },
        fit() {
          graphRef.current?.zoomToFit?.(450, 60);
        },
      }),
      [graph.nodes.length],
    );

    useEffect(() => {
      if (graph.nodes.length > 0) {
        const timer = window.setTimeout(() => graphRef.current?.zoomToFit?.(500, 60), 400);
        return () => window.clearTimeout(timer);
      }
    }, [graph.nodes.length, graph.edges.length]);

    const zoomBy = (delta: number) => {
      const currentZoom = graphRef.current?.zoom?.() || 1;
      graphRef.current?.zoom?.(Math.max(0.2, Math.min(4, currentZoom + delta)), 250);
    };

    const toggleFullscreen = () => {
      const element = containerRef.current;
      if (!element) return;
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void element.requestFullscreen();
      }
    };

    return (
      <section
        ref={containerRef}
        className="relative min-h-[520px] overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-soft"
      >
        {graphData.nodes.length === 0 ? (
          <EmptyGraphState loading={loading} error={error} />
        ) : (
          <ForceGraph2D
            ref={graphRef}
            width={size.width}
            height={size.height}
            graphData={graphData as any}
            nodeId="id"
            nodeLabel={(node: any) => `${node.label} / ${node.type}`}
            linkLabel={(link: any) => link.label}
            linkColor={() => "rgba(148, 163, 184, 0.66)"}
            linkDirectionalArrowLength={3.5}
            linkDirectionalArrowRelPos={1}
            linkWidth={(link: any) => Math.min(2.5, Math.max(1, link.weight || 1))}
            cooldownTicks={80}
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              drawNode(ctx, node, globalScale);
            }}
          />
        )}

        {loading && graphData.nodes.length > 0 && (
          <div className="absolute inset-0 bg-white/45 backdrop-blur-[1px]" />
        )}

        <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm">
          <LegendDot color={nodeColors.Document} label="文档" />
          <LegendDot color={nodeColors.Entity} label="知识点" />
          <LegendDot color={nodeColors.Tag} label="标签" />
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
          <IconButton label="适配视图" onClick={() => graphRef.current?.zoomToFit?.(450, 60)}>
            <ScanLine size={16} />
          </IconButton>
          <IconButton label="缩小" onClick={() => zoomBy(-0.25)}>
            <Minus size={16} />
          </IconButton>
          <div className="border-x border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">
            100%
          </div>
          <IconButton label="放大" onClick={() => zoomBy(0.25)}>
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

function EmptyGraphState({ loading, error }: { loading?: boolean; error?: string }) {
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
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
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

function drawNode(ctx: CanvasRenderingContext2D, node: any, globalScale: number) {
  const type = (node.type || "Entity") as GraphNode["type"];
  const color = nodeColors[type] || nodeColors.Entity;
  const radius = type === "Document" ? 9 : 8;
  const box = type === "Document" ? 24 : 22;

  ctx.save();
  drawRoundRect(ctx, node.x - box / 2, node.y - box / 2, box, box, 6);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${Math.max(9, 11 / globalScale)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(nodeGlyph[type] || "知", node.x, node.y + 0.5);

  const label = truncateLabel(String(node.label || node.id || ""), 14);
  const fontSize = Math.max(9, 12 / globalScale);
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = "#334155";
  ctx.textBaseline = "top";
  ctx.fillText(label, node.x, node.y + radius + 8 / globalScale);
  ctx.restore();
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function truncateLabel(label: string, max: number) {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}
