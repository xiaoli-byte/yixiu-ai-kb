"use client";

import { useMemo, useRef, useState } from "react";
import { Network } from "lucide-react";
import { GraphCanvas, type GraphCanvasHandle } from "@/components/graph/GraphCanvas";
import { GraphSidebar } from "@/components/graph/GraphSidebar";
import { GraphToolbar } from "@/components/graph/GraphToolbar";
import { useGraphWorkspace } from "@/hooks/useGraph";
import type {
  GraphExploreQuery,
  GraphStats,
  GraphWorkspaceResponse,
} from "@/types/api";

const defaultFilters: GraphExploreQuery = {
  keyword: "",
  nodeType: "all",
  depth: 2,
  limit: 80,
};

const emptyStats: GraphStats = {
  nodeTotal: 0,
  edgeTotal: 0,
  documentNodeTotal: 0,
  entityNodeTotal: 0,
  tagNodeTotal: 0,
  categoryTotal: 0,
};

export default function GraphPage() {
  const canvasRef = useRef<GraphCanvasHandle>(null);
  const [filters, setFilters] = useState<GraphExploreQuery>(defaultFilters);
  const [query, setQuery] = useState<GraphExploreQuery>(normalizeFilters(defaultFilters));
  const { data, error, isLoading, isValidating } = useGraphWorkspace(query, {
    shouldRetryOnError: false,
  });

  const workspace = useMemo(() => withFallback(data), [data]);
  const loading = isLoading || isValidating;

  const updateFilters = (patch: Partial<GraphExploreQuery>) => {
    setFilters((current) => ({ ...current, ...patch }));
  };

  const applySearch = () => {
    setQuery(normalizeFilters(filters));
  };

  const resetFilters = () => {
    const next = { ...defaultFilters };
    setFilters(next);
    setQuery(normalizeFilters(next));
  };

  const exportGraph = () => {
    if (canvasRef.current?.exportPng()) return;
    downloadJson(workspace.graph, "knowledge-graph");
  };

  return (
    <div className="min-h-screen overflow-auto bg-slate-50 p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <Network className="text-brand-600" size={21} />
            知识图谱
          </h1>
          <p className="mt-1 text-sm text-slate-500">全局知识网络、文档关系和标签分类一屏探索</p>
        </div>
      </div>

      <div className="space-y-4">
        <GraphToolbar
          filters={filters}
          categories={workspace.categories}
          loading={loading}
          onChange={updateFilters}
          onSearch={applySearch}
          onReset={resetFilters}
          onExport={exportGraph}
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <GraphCanvas
            ref={canvasRef}
            graph={workspace.graph}
            loading={loading}
            error={error ? "图谱加载失败" : undefined}
          />
          <GraphSidebar
            stats={workspace.stats}
            topNodes={workspace.topNodes}
            recentNodes={workspace.recentNodes}
          />
        </div>
      </div>
    </div>
  );
}

function normalizeFilters(filters: GraphExploreQuery): GraphExploreQuery {
  return {
    keyword: filters.keyword?.trim() || undefined,
    nodeType: filters.nodeType || "all",
    categoryId: filters.categoryId || undefined,
    createdFrom: filters.createdFrom || undefined,
    createdTo: filters.createdTo || undefined,
    depth: filters.depth || 2,
    limit: filters.limit || 80,
  };
}

function withFallback(data?: GraphWorkspaceResponse): GraphWorkspaceResponse {
  return (
    data || {
      graph: { nodes: [], edges: [] },
      stats: emptyStats,
      topNodes: [],
      recentNodes: [],
      categories: [],
    }
  );
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
