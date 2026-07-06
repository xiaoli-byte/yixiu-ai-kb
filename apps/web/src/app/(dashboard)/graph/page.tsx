"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Network } from "lucide-react";
import { GraphCanvas, type GraphCanvasHandle } from "@/components/graph/GraphCanvas";
import { GraphEvidenceDrawer, type GraphSelection } from "@/components/graph/GraphEvidenceDrawer";
import { GraphPathPanel } from "@/components/graph/GraphPathPanel";
import { GraphSavedViews } from "@/components/graph/GraphSavedViews";
import { GraphSidebar } from "@/components/graph/GraphSidebar";
import { GraphToolbar, type GraphExportFormat } from "@/components/graph/GraphToolbar";
import { buildGraphExportJson, buildGraphSvg } from "@/components/graph/graphExport";
import { useGraphWorkspace } from "@/hooks/useGraph";
import {
  createGraphRelation,
  deleteGraphRelation,
  deleteGraphView,
  getGraphEdgeEvidence,
  getGraphNodeEvidence,
  getGraphPath,
  listGraphViews,
  mergeGraphEntity,
  reviewGraphRelation,
  saveGraphView,
  updateGraphAliases,
  updateGraphRelation,
} from "@/lib/api/endpoints/graph";
import type {
  GraphData,
  GraphEdgeEvidenceResponse,
  GraphExploreQuery,
  GraphNodeEvidenceResponse,
  GraphSavedView,
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
  const [selection, setSelection] = useState<GraphSelection>(null);
  const [nodeEvidence, setNodeEvidence] = useState<GraphNodeEvidenceResponse | null>(null);
  const [edgeEvidence, setEdgeEvidence] = useState<GraphEdgeEvidenceResponse | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [pathLoading, setPathLoading] = useState(false);
  const [pathGraph, setPathGraph] = useState<GraphData | null>(null);
  const [pathFound, setPathFound] = useState<boolean | null>(null);
  const [views, setViews] = useState<GraphSavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [layoutCenterNodeId, setLayoutCenterNodeId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, error, isLoading, isValidating, mutate } = useGraphWorkspace(query, {
    shouldRetryOnError: false,
  });

  const workspace = useMemo(() => withFallback(data), [data]);
  const loading = isLoading || isValidating;
  const displayGraph = pathGraph || workspace.graph;
  const centerNodeId = layoutCenterNodeId || workspace.centerNodeId || undefined;
  const pathNodeIds = useMemo(() => pathGraph?.nodes.map((node) => node.id) || [], [pathGraph]);
  const pathEdgeIds = useMemo(() => pathGraph?.edges.map((edge) => edge.id) || [], [pathGraph]);
  const highlightNodeIds = useMemo(
    () => [...new Set([...workspace.matchedNodeIds, ...pathNodeIds])],
    [workspace.matchedNodeIds, pathNodeIds],
  );

  useEffect(() => {
    let active = true;
    void listGraphViews()
      .then((items) => {
        if (active) setViews(items);
      })
      .catch((err) => {
        if (active) setActionError(toErrorMessage(err));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!selection) {
      setNodeEvidence(null);
      setEdgeEvidence(null);
      setEvidenceLoading(false);
      return () => {
        active = false;
      };
    }

    setEvidenceLoading(true);
    void fetchSelectionEvidence(selection)
      .then((result) => {
        if (!active) return;
        setNodeEvidence(result.type === "node" ? result.data : null);
        setEdgeEvidence(result.type === "edge" ? result.data : null);
      })
      .catch((err) => {
        if (active) setActionError(toErrorMessage(err));
      })
      .finally(() => {
        if (active) setEvidenceLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selection]);

  const updateFilters = (patch: Partial<GraphExploreQuery>) => {
    setFilters((current) => ({ ...current, ...patch }));
  };

  const applySearch = () => {
    const next = normalizeFilters(filters);
    setQuery(next);
    setActiveViewId(null);
    setLayoutCenterNodeId(null);
    clearPath();
  };

  const resetFilters = () => {
    const next = { ...defaultFilters };
    setFilters(next);
    setQuery(normalizeFilters(next));
    setActiveViewId(null);
    setLayoutCenterNodeId(null);
    setSelection(null);
    clearPath();
  };

  const refreshSelection = async (target = selection) => {
    if (!target) return;
    const result = await fetchSelectionEvidence(target);
    if (result.type === "node") {
      setNodeEvidence(result.data);
      setEdgeEvidence(null);
    } else {
      setEdgeEvidence(result.data);
      setNodeEvidence(null);
    }
  };

  const runGraphAction = async (action: () => Promise<void>, refreshCurrentSelection = true) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await action();
      await mutate();
      clearPath();
      if (refreshCurrentSelection) await refreshSelection();
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleExport = async (format: GraphExportFormat) => {
    const filename = `knowledge-graph-${new Date().toISOString().slice(0, 10)}`;
    if (format === "png") {
      if (await canvasRef.current?.exportPng()) return;
      setActionError("PNG 导出失败，已保留 SVG/JSON 导出可用");
      return;
    }
    if (format === "svg") {
      downloadBlob(
        buildGraphSvg(displayGraph, { centerNodeId }),
        `${filename}.svg`,
        "image/svg+xml;charset=utf-8",
      );
      return;
    }
    downloadBlob(
      JSON.stringify(
        buildGraphExportJson({
          graph: displayGraph,
          filters: query,
          centerNodeId,
          savedViewId: activeViewId,
        }),
        null,
        2,
      ),
      `${filename}.json`,
      "application/json;charset=utf-8",
    );
  };

  const handlePathSearch = async (input: { sourceId: string; targetId: string; maxDepth: number }) => {
    setPathLoading(true);
    setActionError(null);
    try {
      const result = await getGraphPath(input);
      setPathFound(result.found);
      setPathGraph(result.found ? result.graph : null);
      setLayoutCenterNodeId(input.sourceId);
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setPathLoading(false);
    }
  };

  const handleSaveView = async (input: { name: string; visibility: "PRIVATE" | "SHARED" }) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const view = await saveGraphView({
        name: input.name,
        visibility: input.visibility,
        filters: query,
        layout: { centerNodeId: centerNodeId || null },
      });
      setViews((current) => [view, ...current.filter((item) => item.id !== view.id)]);
      setActiveViewId(view.id);
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleApplyView = (view: GraphSavedView) => {
    const next = normalizeFilters({ ...defaultFilters, ...view.filters });
    const savedCenter = typeof view.layout?.centerNodeId === "string" ? view.layout.centerNodeId : null;
    setFilters(next);
    setQuery(next);
    setActiveViewId(view.id);
    setLayoutCenterNodeId(savedCenter);
    clearPath();
  };

  const handleDeleteView = async (id: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await deleteGraphView(id);
      setViews((current) => current.filter((view) => view.id !== id));
      if (activeViewId === id) setActiveViewId(null);
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  function clearPath() {
    setPathGraph(null);
    setPathFound(null);
  }

  return (
    <div className="min-h-screen overflow-auto bg-slate-50 p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <Network className="text-brand-600" size={21} />
            知识图谱
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            证据追踪、路径定位、实体治理和关系审核集中在同一张图上。
          </p>
        </div>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {actionError}
        </div>
      )}

      <div className="space-y-4">
        <GraphToolbar
          filters={filters}
          categories={workspace.categories}
          filterOptions={workspace.filterOptions}
          loading={loading}
          onChange={updateFilters}
          onSearch={applySearch}
          onReset={resetFilters}
          onExport={handleExport}
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <GraphCanvas
            ref={canvasRef}
            graph={displayGraph}
            loading={loading || pathLoading}
            error={error ? "图谱加载失败" : undefined}
            centerNodeId={centerNodeId}
            selectedNodeId={selection?.type === "node" ? selection.id : null}
            selectedEdgeId={selection?.type === "edge" ? selection.id : null}
            highlightNodeIds={highlightNodeIds}
            highlightEdgeIds={pathEdgeIds}
            onCenterChange={setLayoutCenterNodeId}
            onNodeSelect={(id) => setSelection({ type: "node", id })}
            onEdgeSelect={(id) => setSelection({ type: "edge", id })}
            onExpand={(id) => {
              setSelection({ type: "node", id });
              setLayoutCenterNodeId(id);
            }}
          />

          <div className="space-y-4">
            <GraphSavedViews
              views={views}
              activeViewId={activeViewId}
              busy={actionLoading}
              onSave={handleSaveView}
              onApply={handleApplyView}
              onDelete={handleDeleteView}
            />
            <GraphPathPanel
              graph={workspace.graph}
              selectedNodeId={selection?.type === "node" ? selection.id : null}
              pathActive={pathFound !== null}
              pathFound={pathFound}
              busy={pathLoading || actionLoading}
              onSearch={handlePathSearch}
              onClear={clearPath}
              onCreateRelation={(input) =>
                runGraphAction(async () => {
                  const created = await createGraphRelation(input);
                  setSelection({ type: "edge", id: created.edge.id });
                }, false)
              }
            />
            {selection ? (
              <GraphEvidenceDrawer
                graph={workspace.graph}
                selection={selection}
                nodeEvidence={nodeEvidence}
                edgeEvidence={edgeEvidence}
                loading={evidenceLoading}
                busy={actionLoading}
                onClose={() => setSelection(null)}
                onUpdateAliases={(nodeId, aliases, reason) =>
                  runGraphAction(async () => {
                    await updateGraphAliases(nodeId, { aliases, reason });
                  })
                }
                onMergeEntity={(sourceNodeId, input) =>
                  runGraphAction(async () => {
                    await mergeGraphEntity(sourceNodeId, input);
                    setSelection({ type: "node", id: input.targetNodeId });
                    setLayoutCenterNodeId(input.targetNodeId);
                  }, false)
                }
                onUpdateRelation={(edgeId, relationType, reason) =>
                  runGraphAction(async () => {
                    await updateGraphRelation(edgeId, { relationType, reason });
                  })
                }
                onReviewRelation={(edgeId, reviewStatus, reason) =>
                  runGraphAction(async () => {
                    await reviewGraphRelation(edgeId, { reviewStatus, reason });
                  })
                }
                onDeleteRelation={(edgeId, reason) =>
                  runGraphAction(async () => {
                    await deleteGraphRelation(edgeId, { reason });
                    setSelection(null);
                  }, false)
                }
              />
            ) : (
              <GraphSidebar
                stats={workspace.stats}
                topNodes={workspace.topNodes}
                recentNodes={workspace.recentNodes}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

async function fetchSelectionEvidence(selection: Exclude<GraphSelection, null>) {
  if (selection.type === "node") {
    return { type: "node" as const, data: await getGraphNodeEvidence(selection.id) };
  }
  return { type: "edge" as const, data: await getGraphEdgeEvidence(selection.id) };
}

function normalizeFilters(filters: GraphExploreQuery): GraphExploreQuery {
  return {
    keyword: filters.keyword?.trim() || undefined,
    nodeType: filters.nodeType || "all",
    documentId: filters.documentId || undefined,
    entityType: filters.entityType || undefined,
    relationType: filters.relationType || undefined,
    categoryId: filters.categoryId || undefined,
    createdFrom: filters.createdFrom || undefined,
    createdTo: filters.createdTo || undefined,
    updatedFrom: filters.updatedFrom || undefined,
    updatedTo: filters.updatedTo || undefined,
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
      matchedNodeIds: [],
      centerNodeId: null,
      filterOptions: {
        entityTypes: [],
        relationTypes: [],
        documents: [],
      },
    }
  );
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  return "图谱操作失败";
}
