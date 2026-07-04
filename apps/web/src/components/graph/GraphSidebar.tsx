"use client";

import Link from "next/link";
import {
  FileText,
  Folder,
  Layers3,
  Lightbulb,
  Network,
  Share2,
  Tag,
} from "lucide-react";
import type { GraphRecentNode, GraphStats, GraphTopNode } from "@/types/api";
import { cn, formatDate } from "@/lib/utils";

interface GraphSidebarProps {
  stats: GraphStats;
  topNodes: GraphTopNode[];
  recentNodes: GraphRecentNode[];
}

const numberFormat = new Intl.NumberFormat("zh-CN");

const statCards = [
  {
    key: "nodeTotal",
    label: "节点总数",
    icon: Layers3,
    className: "text-brand-600 bg-brand-50",
  },
  {
    key: "edgeTotal",
    label: "关系总数",
    icon: Share2,
    className: "text-emerald-600 bg-emerald-50",
  },
  {
    key: "documentNodeTotal",
    label: "文档节点",
    icon: FileText,
    className: "text-sky-600 bg-sky-50",
  },
  {
    key: "entityNodeTotal",
    label: "知识点",
    icon: Lightbulb,
    className: "text-green-600 bg-green-50",
  },
  {
    key: "tagNodeTotal",
    label: "标签",
    icon: Tag,
    className: "text-violet-600 bg-violet-50",
  },
  {
    key: "categoryTotal",
    label: "业务分类",
    icon: Folder,
    className: "text-amber-600 bg-amber-50",
  },
] as const;

export function GraphSidebar({ stats, topNodes, recentNodes }: GraphSidebarProps) {
  return (
    <aside className="space-y-4">
      <section className="rounded-lg border border-slate-200/80 bg-white p-4 shadow-soft">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-800">图谱数据统计</h2>
          <Network size={14} className="text-slate-300" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {statCards.map((item) => {
            const Icon = item.icon;
            const value = stats[item.key];
            return (
              <div key={item.key} className="rounded-lg border border-slate-100 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">{item.label}</span>
                  <span className={cn("grid h-8 w-8 place-items-center rounded-lg", item.className)}>
                    <Icon size={18} />
                  </span>
                </div>
                <div className="text-xl font-semibold tabular-nums text-slate-900">
                  {numberFormat.format(value)}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200/80 bg-white p-4 shadow-soft">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">热门知识点 Top 5</h2>
        <div className="space-y-3">
          {topNodes.length === 0 ? (
            <EmptyRow text="暂无热门知识点" />
          ) : (
            topNodes.map((node, index) => (
              <div key={node.id} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2 text-sm">
                <span
                  className={cn(
                    "grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold",
                    index < 3 ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500",
                  )}
                >
                  {index + 1}
                </span>
                <span className="truncate font-medium text-slate-700">{node.label}</span>
                <span className="text-xs tabular-nums text-slate-400">
                  关联数：{numberFormat.format(node.relationCount || node.documentCount || 0)}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200/80 bg-white p-4 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">最近更新的节点</h2>
          <Link href="/documents" className="text-xs font-medium text-brand-600 hover:text-brand-700">
            更多
          </Link>
        </div>
        <div className="space-y-3">
          {recentNodes.length === 0 ? (
            <EmptyRow text="暂无最近更新" />
          ) : (
            recentNodes.map((node) => (
              <div key={node.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 text-sm">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-600">
                  <FileText size={15} />
                </span>
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-700">{node.label}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                    <span className="truncate">{formatDate(node.updatedAt)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </aside>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">{text}</div>;
}
