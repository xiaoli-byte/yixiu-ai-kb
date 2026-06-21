"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { Search, Loader2, Network } from "lucide-react";
import graphApi from "@/services/graph";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

interface GraphNode {
  id: string;
  label: string;
  type: string;
  val?: number;
  properties?: any;
}
interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export default function GraphPage() {
  const [keyword, setKeyword] = useState("");
  const [type, setType] = useState<"Entity" | "Tag" | "Document">("Entity");
  const [depth, setDepth] = useState(2);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({
    nodes: [],
    edges: [],
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    function update() {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        setSize({ w: r.width, h: r.height });
      }
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    loadTop();
  }, []);

  async function loadTop() {
    setLoading(true);
    try {
      const res = await graphApi.top(30);
      // 简单扩展为子图：把 top 节点拉出来后自动获取关系
      const ids = res.map((n) => n.id);
      if (ids.length === 0) {
        setData({ nodes: [], edges: [] });
        return;
      }
      // 简化：直接展示 top 节点，无边（要拿到边需要批量查）
      setData({ nodes: res, edges: [] });
    } finally {
      setLoading(false);
    }
  }

  async function search() {
    if (!keyword.trim()) return loadTop();
    setLoading(true);
    try {
      const res = await graphApi.search({ keyword, type, depth, limit: 30 });
      setData(res);
    } finally {
      setLoading(false);
    }
  }

  const graphData = useMemo(
    () => ({
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.edges.map((e) => ({ ...e })),
    }),
    [data],
  );

  return (
    <div className="p-8 h-[calc(100vh-0px)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Network className="text-brand-600" size={22} /> 知识图谱
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            浏览文档中抽取的实体与它们之间的关系（Neo4j 驱动）
          </p>
        </div>
      </div>

      <div className="card p-4 mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder="输入实体名称、标签或文档标题..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
        </div>
        <select
          className="input w-32"
          value={type}
          onChange={(e) => setType(e.target.value as any)}
        >
          <option value="Entity">实体</option>
          <option value="Tag">标签</option>
          <option value="Document">文档</option>
        </select>
        <select
          className="input w-28"
          value={depth}
          onChange={(e) => setDepth(Number(e.target.value))}
        >
          <option value={1}>深度 1</option>
          <option value={2}>深度 2</option>
          <option value={3}>深度 3</option>
        </select>
        <button className="btn-primary" onClick={search} disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          探索
        </button>
      </div>

      <div ref={containerRef} className="card flex-1 relative overflow-hidden">
        {graphData.nodes.length === 0 ? (
          <div className="absolute inset-0 grid place-items-center text-slate-400">
            <div className="text-center">
              <Network className="mx-auto mb-2" size={32} />
              <p className="text-sm">
                {loading ? "加载中..." : "暂无图谱数据，上传文档并完成实体抽取后再来探索"}
              </p>
            </div>
          </div>
        ) : (
          <ForceGraph2D
            width={size.w}
            height={size.h}
            graphData={graphData as any}
            nodeLabel={(n: any) => `${n.label} (${n.type})`}
            linkLabel={(l: any) => l.label}
            nodeRelSize={6}
            nodeColor={(n: any) => {
              switch (n.type) {
                case "Document":
                  return "#1d59f5";
                case "Entity":
                  return "#10b981";
                case "Tag":
                  return "#f59e0b";
                default:
                  return "#94a3b8";
              }
            }}
            linkColor={() => "#cbd5e1"}
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              const r = 6;
              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
              ctx.fillStyle = node.color || "#1d59f5";
              ctx.fill();
              ctx.font = `${12 / globalScale}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillStyle = "#1e293b";
              ctx.fillText(node.label, node.x, node.y + r + 2);
            }}
          />
        )}
        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur rounded-lg border border-slate-200 p-3 text-xs space-y-1.5">
          <div className="font-medium text-slate-600 mb-1">图例</div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-brand-600" /> 文档
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500" /> 实体
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500" /> 标签
          </div>
        </div>
      </div>
    </div>
  );
}