"use client";

import { CheckCircle2, Loader2, Merge, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  GraphData,
  GraphEdgeEvidenceResponse,
  GraphEvidenceItem,
  GraphNodeEvidenceResponse,
} from "@/types/api";
import { Select } from "@/components/ui/Select";
import { EditorOrAbove } from "@/components/PermissionGate";

export type GraphSelection =
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | null;

interface GraphEvidenceDrawerProps {
  graph: GraphData;
  selection: GraphSelection;
  nodeEvidence?: GraphNodeEvidenceResponse | null;
  edgeEvidence?: GraphEdgeEvidenceResponse | null;
  loading?: boolean;
  busy?: boolean;
  onClose: () => void;
  onUpdateAliases: (nodeId: string, aliases: string[], reason?: string) => Promise<void>;
  onMergeEntity: (
    sourceNodeId: string,
    input: { targetNodeId: string; aliases: string[]; reason?: string },
  ) => Promise<void>;
  onUpdateRelation: (edgeId: string, relationType: string, reason?: string) => Promise<void>;
  onReviewRelation: (
    edgeId: string,
    reviewStatus: "APPROVED" | "REJECTED" | "PENDING",
    reason?: string,
  ) => Promise<void>;
  onDeleteRelation: (edgeId: string, reason?: string) => Promise<void>;
}

export function GraphEvidenceDrawer({
  graph,
  selection,
  nodeEvidence,
  edgeEvidence,
  loading,
  busy,
  onClose,
  onUpdateAliases,
  onMergeEntity,
  onUpdateRelation,
  onReviewRelation,
  onDeleteRelation,
}: GraphEvidenceDrawerProps) {
  const [aliasText, setAliasText] = useState("");
  const [nodeReason, setNodeReason] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [relationType, setRelationType] = useState("");
  const [relationReason, setRelationReason] = useState("");

  useEffect(() => {
    setAliasText((nodeEvidence?.node.aliases || []).join(", "));
    setNodeReason("");
    setMergeTargetId("");
  }, [nodeEvidence?.node.id, nodeEvidence?.node.aliases]);

  useEffect(() => {
    setRelationType(edgeEvidence?.edge.relationType || "");
    setRelationReason("");
  }, [edgeEvidence?.edge.id, edgeEvidence?.edge.relationType]);

  const entityTargets = useMemo(
    () =>
      graph.nodes.filter(
        (node) =>
          node.type === "Entity" &&
          selection?.type === "node" &&
          node.id !== selection.id &&
          node.properties?.mergeStatus !== "MERGED",
      ),
    [graph.nodes, selection],
  );

  if (!selection) return null;

  const isNode = selection.type === "node";
  const title = isNode
    ? nodeEvidence?.node.label || "节点证据"
    : edgeEvidence?.edge
      ? `${edgeEvidence.edge.sourceName || "源节点"} → ${edgeEvidence.edge.targetName || "目标节点"}`
      : "关系证据";

  return (
    <aside className="rounded-xl border border-slate-200/80 bg-white shadow-card">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">{isNode ? "节点证据与实体治理" : "关系证据与审核"}</p>
        </div>
        <button
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
          type="button"
          onClick={onClose}
          aria-label="关闭证据面板"
        >
          <X size={16} />
        </button>
      </header>

      <div className="max-h-[calc(100vh-220px)] overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-slate-50 py-10 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            加载证据
          </div>
        ) : isNode ? (
          nodeEvidence ? (
            <NodePanel
              graph={graph}
              data={nodeEvidence}
              aliasText={aliasText}
              nodeReason={nodeReason}
              mergeTargetId={mergeTargetId}
              busy={busy}
              entityTargets={entityTargets}
              onAliasText={setAliasText}
              onNodeReason={setNodeReason}
              onMergeTarget={setMergeTargetId}
              onUpdateAliases={() =>
                onUpdateAliases(nodeEvidence.node.id, parseAliases(aliasText), nodeReason || undefined)
              }
              onMerge={() =>
                mergeTargetId
                  ? onMergeEntity(nodeEvidence.node.id, {
                      targetNodeId: mergeTargetId,
                      aliases: parseAliases(aliasText),
                      reason: nodeReason || undefined,
                    })
                  : Promise.resolve()
              }
            />
          ) : (
            <EmptyEvidence />
          )
        ) : edgeEvidence ? (
          <EdgePanel
            data={edgeEvidence}
            relationType={relationType}
            relationReason={relationReason}
            busy={busy}
            onRelationType={setRelationType}
            onRelationReason={setRelationReason}
            onUpdateRelation={() =>
              onUpdateRelation(edgeEvidence.edge.id, relationType, relationReason || undefined)
            }
            onReview={(status) =>
              onReviewRelation(edgeEvidence.edge.id, status, relationReason || undefined)
            }
            onDelete={() => onDeleteRelation(edgeEvidence.edge.id, relationReason || undefined)}
          />
        ) : (
          <EmptyEvidence />
        )}
      </div>
    </aside>
  );
}

function NodePanel({
  data,
  aliasText,
  nodeReason,
  mergeTargetId,
  busy,
  entityTargets,
  onAliasText,
  onNodeReason,
  onMergeTarget,
  onUpdateAliases,
  onMerge,
}: {
  graph: GraphData;
  data: GraphNodeEvidenceResponse;
  aliasText: string;
  nodeReason: string;
  mergeTargetId: string;
  busy?: boolean;
  entityTargets: GraphData["nodes"];
  onAliasText: (value: string) => void;
  onNodeReason: (value: string) => void;
  onMergeTarget: (value: string) => void;
  onUpdateAliases: () => Promise<void>;
  onMerge: () => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <InfoGrid
        items={[
          ["类型", String(data.node.properties?.entityType || data.node.type)],
          ["合并状态", data.node.mergeStatus || "ACTIVE"],
          ["证据数", String(data.evidences.length)],
        ]}
      />

      <section className="space-y-2">
        <label className="text-xs font-medium text-slate-600" htmlFor="graph-node-aliases">
          别名
        </label>
        <textarea
          id="graph-node-aliases"
          className="input min-h-[76px] resize-y py-2"
          value={aliasText}
          onChange={(event) => onAliasText(event.target.value)}
          placeholder="多个别名用逗号或换行分隔"
        />
        <input
          className="input h-10"
          value={nodeReason}
          onChange={(event) => onNodeReason(event.target.value)}
          placeholder="变更原因"
        />
        {/* 保存别名为写操作，对非 editor+ 角色隐藏 */}
        <EditorOrAbove hidden>
          <button className="btn-primary h-10 w-full" type="button" disabled={busy} onClick={onUpdateAliases}>
            <Pencil size={15} />
            保存别名
          </button>
        </EditorOrAbove>
      </section>

      <section className="space-y-2">
        <span className="block text-xs font-medium text-slate-600">合并到</span>
        <Select
          className="w-full"
          triggerClassName="h-10"
          triggerWidthClassName="w-full"
          ariaLabel="合并到目标实体"
          placeholder="选择目标实体"
          searchable
          value={mergeTargetId}
          options={entityTargets.map((node) => ({ value: node.id, label: node.label }))}
          onChange={onMergeTarget}
        />
        {/* 软合并实体为写操作，对非 editor+ 角色隐藏 */}
        <EditorOrAbove hidden>
          <button
            className="btn-ghost h-10 w-full border border-slate-200"
            type="button"
            disabled={busy || !mergeTargetId}
            onClick={onMerge}
          >
            <Merge size={15} />
            软合并实体
          </button>
        </EditorOrAbove>
      </section>

      <EvidenceList evidences={data.evidences} />
    </div>
  );
}

function EdgePanel({
  data,
  relationType,
  relationReason,
  busy,
  onRelationType,
  onRelationReason,
  onUpdateRelation,
  onReview,
  onDelete,
}: {
  data: GraphEdgeEvidenceResponse;
  relationType: string;
  relationReason: string;
  busy?: boolean;
  onRelationType: (value: string) => void;
  onRelationReason: (value: string) => void;
  onUpdateRelation: () => Promise<void>;
  onReview: (status: "APPROVED" | "REJECTED" | "PENDING") => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <InfoGrid
        items={[
          ["关系", data.edge.relationType],
          ["状态", data.edge.status],
          ["审核", data.edge.reviewStatus],
          ["证据数", String(data.edge.evidenceCount)],
          ["来源数", String(data.edge.sourceCount)],
          ["权重", data.edge.weight.toFixed(2)],
        ]}
      />

      <section className="space-y-2">
        <label className="text-xs font-medium text-slate-600" htmlFor="graph-relation-type">
          关系类型
        </label>
        <input
          id="graph-relation-type"
          className="input h-10"
          value={relationType}
          onChange={(event) => onRelationType(event.target.value)}
        />
        <input
          className="input h-10"
          value={relationReason}
          onChange={(event) => onRelationReason(event.target.value)}
          placeholder="变更或审核原因"
        />
        {/* 保存关系为写操作，对非 editor+ 角色隐藏 */}
        <EditorOrAbove hidden>
          <button className="btn-primary h-10 w-full" type="button" disabled={busy || !relationType.trim()} onClick={onUpdateRelation}>
            <Pencil size={15} />
            保存关系
          </button>
        </EditorOrAbove>
      </section>

      <div className="grid grid-cols-3 gap-2">
        {/* 审核三键（通过/待审/驳回）为写操作，对非 editor+ 角色隐藏 */}
        <EditorOrAbove hidden>
          <button className="btn-ghost h-10 border border-slate-200" type="button" disabled={busy} onClick={() => onReview("APPROVED")}>
            <CheckCircle2 size={15} />
            通过
          </button>
          <button className="btn-ghost h-10 border border-slate-200" type="button" disabled={busy} onClick={() => onReview("PENDING")}>
            待审
          </button>
          <button className="btn-ghost h-10 border border-red-100 text-red-600 hover:bg-red-50" type="button" disabled={busy} onClick={() => onReview("REJECTED")}>
            驳回
          </button>
        </EditorOrAbove>
      </div>

      {/* 删除关系为写操作，对非 editor+ 角色隐藏 */}
      <EditorOrAbove hidden>
        <button className="btn-ghost h-10 w-full border border-red-100 text-red-600 hover:bg-red-50" type="button" disabled={busy} onClick={onDelete}>
          <Trash2 size={15} />
          删除关系
        </button>
      </EditorOrAbove>

      <EvidenceList evidences={data.evidences} />
    </div>
  );
}

function InfoGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-2 gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
          <dt className="text-[11px] text-slate-400">{label}</dt>
          <dd className="mt-1 truncate text-xs font-medium text-slate-700" title={value}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function EvidenceList({ evidences }: { evidences: GraphEvidenceItem[] }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-slate-600">证据片段</h3>
      {evidences.length === 0 ? (
        <EmptyEvidence />
      ) : (
        evidences.map((evidence) => (
          <article key={evidence.id} className="rounded-lg border border-slate-100 p-3">
            <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-slate-400">
              <span className="truncate">{evidence.documentTitle || evidence.documentId || "未知文档"}</span>
              <span className="shrink-0">
                {evidence.confidence == null ? "未评分" : `${Math.round(evidence.confidence * 100)}%`}
              </span>
            </div>
            <p className="text-xs leading-5 text-slate-600">{evidence.evidenceText || "暂无证据文本"}</p>
          </article>
        ))
      )}
    </section>
  );
}

function EmptyEvidence() {
  return <div className="rounded-lg bg-slate-50 px-3 py-6 text-center text-xs text-slate-400">暂无证据</div>;
}

function parseAliases(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
