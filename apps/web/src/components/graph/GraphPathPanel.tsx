"use client";

import { Link2, Loader2, Plus, Route, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { GraphData } from "@/types/api";

interface GraphPathPanelProps {
  graph: GraphData;
  selectedNodeId?: string | null;
  pathActive?: boolean;
  pathFound?: boolean | null;
  busy?: boolean;
  onSearch: (input: { sourceId: string; targetId: string; maxDepth: number }) => Promise<void>;
  onClear: () => void;
  onCreateRelation: (input: {
    sourceNodeId: string;
    targetNodeId: string;
    relationType: string;
    evidenceText?: string;
    reason?: string;
  }) => Promise<void>;
}

export function GraphPathPanel({
  graph,
  selectedNodeId,
  pathActive,
  pathFound,
  busy,
  onSearch,
  onClear,
  onCreateRelation,
}: GraphPathPanelProps) {
  const nodes = useMemo(() => graph.nodes.filter((node) => node.type !== "Chunk"), [graph.nodes]);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [maxDepth, setMaxDepth] = useState(3);
  const [relationType, setRelationType] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!selectedNodeId) return;
    if (!sourceId) setSourceId(selectedNodeId);
    else if (!targetId && selectedNodeId !== sourceId) setTargetId(selectedNodeId);
  }, [selectedNodeId, sourceId, targetId]);

  const canUsePair = Boolean(sourceId && targetId && sourceId !== targetId);

  return (
    <section className="rounded-lg border border-slate-200/80 bg-white p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Route size={16} className="text-brand-600" />
            路径与人工关系
          </h2>
          {pathActive && (
            <p className="mt-1 text-xs text-slate-500">
              {pathFound ? "已高亮最短路径" : "未找到可达路径"}
            </p>
          )}
        </div>
        {pathActive && (
          <button
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
            type="button"
            onClick={onClear}
            aria-label="清除路径"
          >
            <X size={15} />
          </button>
        )}
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <NodeSelect label="起点" value={sourceId} nodes={nodes} onChange={setSourceId} />
          <NodeSelect label="终点" value={targetId} nodes={nodes} onChange={setTargetId} />
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <select
            className="input h-10"
            value={maxDepth}
            onChange={(event) => setMaxDepth(Number(event.target.value))}
            aria-label="路径最大深度"
          >
            <option value={2}>最多 2 跳</option>
            <option value={3}>最多 3 跳</option>
            <option value={4}>最多 4 跳</option>
            <option value={5}>最多 5 跳</option>
          </select>
          <button
            className="btn-primary h-10 min-w-[96px]"
            type="button"
            disabled={busy || !canUsePair}
            onClick={() => onSearch({ sourceId, targetId, maxDepth })}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
            查询
          </button>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <div className="mb-2 text-xs font-medium text-slate-600">人工关系</div>
          <input
            className="input h-10"
            value={relationType}
            onChange={(event) => setRelationType(event.target.value)}
            placeholder="关系类型，例如 SUPPORTS"
          />
          <textarea
            className="input mt-2 min-h-[68px] resize-y py-2"
            value={evidenceText}
            onChange={(event) => setEvidenceText(event.target.value)}
            placeholder="证据说明"
          />
          <input
            className="input mt-2 h-10"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="创建原因"
          />
          <button
            className="btn-ghost mt-2 h-10 w-full border border-slate-200"
            type="button"
            disabled={busy || !canUsePair || !relationType.trim()}
            onClick={() =>
              onCreateRelation({
                sourceNodeId: sourceId,
                targetNodeId: targetId,
                relationType: relationType.trim(),
                evidenceText: evidenceText.trim() || undefined,
                reason: reason.trim() || undefined,
              })
            }
          >
            <Plus size={15} />
            新增关系
          </button>
        </div>
      </div>
    </section>
  );
}

function NodeSelect({
  label,
  value,
  nodes,
  onChange,
}: {
  label: string;
  value: string;
  nodes: GraphData["nodes"];
  onChange: (value: string) => void;
}) {
  return (
    <select
      className="input h-10"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      title={label}
    >
      <option value="">{label}</option>
      {nodes.map((node) => (
        <option key={node.id} value={node.id}>
          {node.label}
        </option>
      ))}
    </select>
  );
}
