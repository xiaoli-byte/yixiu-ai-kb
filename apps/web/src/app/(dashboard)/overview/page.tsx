"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  FilePlus2,
  FileText,
  Info,
  MessageCircle,
  Search,
  Trash2,
  Upload,
  UserCheck,
  Users,
  Edit3,
} from "lucide-react";
import documentsApi, { type DocumentDto } from "@/services/documents";
import qaApi, { type Conversation } from "@/services/qa";
import usersApi from "@/services/users";
import { cn } from "@/lib/utils";

type RangeKey = "today" | "week" | "month";
type OverviewUser = { createdAt?: string };

type EChartsInstance = {
  setOption: (option: Record<string, unknown>, notMerge?: boolean) => void;
  resize: () => void;
  dispose: () => void;
};

declare global {
  interface Window {
    echarts?: {
      init: (element: HTMLElement, theme?: string | null, opts?: Record<string, unknown>) => EChartsInstance;
      getInstanceByDom: (element: HTMLElement) => EChartsInstance | undefined;
    };
  }
}

const numberFormat = new Intl.NumberFormat("zh-CN");

const trendLabels = [
  "00:00",
  "02:00",
  "04:00",
  "06:00",
  "08:00",
  "10:00",
  "12:00",
  "14:00",
  "16:00",
  "18:00",
  "20:00",
  "22:00",
  "24:00",
];

const trendSeries: Record<RangeKey, number[]> = {
  today: [0, 80, 160, 420, 350, 580, 940, 1240, 1520, 1470, 1120, 520, 0],
  week: [620, 840, 1120, 1360, 1480, 1720, 1980, 2210, 2360, 2080, 1740, 1260, 920],
  month: [4100, 4380, 4860, 5320, 5740, 6210, 6880, 7520, 7860, 7420, 6810, 5940, 5150],
};

const fallbackCategories = [
  { name: "产品文档", value: 8456, color: "#1683ff" },
  { name: "技术文档", value: 6789, color: "#49c785" },
  { name: "培训资料", value: 4321, color: "#ffb52e" },
  { name: "制度流程", value: 3210, color: "#9d76d8" },
  { name: "市场营销", value: 1791, color: "#67bde8" },
];

const operationTone = {
  upload: { label: "上传文档", icon: Upload, className: "text-brand-600 bg-brand-50" },
  update: { label: "更新文档", icon: Edit3, className: "text-slate-600 bg-slate-100" },
  delete: { label: "删除文档", icon: Trash2, className: "text-rose-600 bg-rose-50" },
  login: { label: "用户登录", icon: UserCheck, className: "text-emerald-600 bg-emerald-50" },
  qa: { label: "AI问答", icon: MessageCircle, className: "text-sky-600 bg-sky-50" },
};

interface CategoryItem {
  name: string;
  value: number;
  color: string;
}

interface OperationRow {
  time: string;
  user: string;
  type: keyof typeof operationTone;
  content: string;
  related: string;
  relatedHref?: string;
}

export default function OverviewPage() {
  const [range, setRange] = useState<RangeKey>("today");
  const [chartsReady, setChartsReady] = useState(false);
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [documentTotal, setDocumentTotal] = useState<number | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationTotal, setConversationTotal] = useState<number | null>(null);
  const [users, setUsers] = useState<OverviewUser[]>([]);
  const [userTotal, setUserTotal] = useState<number | null>(null);

  useEffect(() => {
    let canceled = false;

    async function loadOverview() {
      const [docResult, conversationResult, userResult] = await Promise.allSettled([
        documentsApi.list({ page: 1, pageSize: 100 }),
        qaApi.conversationList(),
        usersApi.list(),
      ]);

      if (canceled) return;

      if (docResult.status === "fulfilled") {
        setDocuments(docResult.value.items || []);
        setDocumentTotal(docResult.value.total ?? docResult.value.items?.length ?? 0);
      }

      if (conversationResult.status === "fulfilled") {
        setConversations(conversationResult.value || []);
        setConversationTotal(conversationResult.value?.length ?? 0);
      }

      if (userResult.status === "fulfilled") {
        setUsers((userResult.value || []) as OverviewUser[]);
        setUserTotal(userResult.value?.length ?? 0);
      }
    }

    void loadOverview();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (window.echarts) {
      setChartsReady(true);
    }
  }, []);

  const todayDocs = useMemo(
    () => documents.filter((doc) => isSameDay(doc.createdAt, new Date())).length,
    [documents],
  );
  const yesterdayDocs = useMemo(
    () => documents.filter((doc) => isSameDay(doc.createdAt, addDays(new Date(), -1))).length,
    [documents],
  );
  const todayUsers = useMemo(
    () => users.filter((user) => user.createdAt && isSameDay(user.createdAt, new Date())).length,
    [users],
  );
  const todayConversations = useMemo(
    () => conversations.filter((item) => isSameDay(item.updatedAt, new Date())).length,
    [conversations],
  );

  const resolvedDocumentTotal = documentTotal ?? 24567;
  const resolvedConversationTotal = conversationTotal ?? 2345;
  const resolvedUserTotal = userTotal ?? 1234;
  const estimatedSearchTotal =
    documentTotal !== null || conversationTotal !== null
      ? Math.max(resolvedDocumentTotal * 2 + resolvedConversationTotal * 3, 0)
      : 8765;

  const metricCards = [
    {
      label: "文档总数",
      value: resolvedDocumentTotal,
      delta: documentTotal === null ? 320 : Math.max(todayDocs, 0),
      icon: FileText,
      iconClass: "bg-brand-50 text-brand-600",
    },
    {
      label: "今日新增文档",
      value: documentTotal === null ? 128 : todayDocs,
      delta: documentTotal === null ? 15 : todayDocs - yesterdayDocs,
      icon: FilePlus2,
      iconClass: "bg-blue-50 text-blue-600",
    },
    {
      label: "AI问答次数",
      value: resolvedConversationTotal,
      delta: conversationTotal === null ? 234 : todayConversations,
      icon: Bot,
      iconClass: "bg-indigo-50 text-indigo-600",
    },
    {
      label: "用户搜索次数",
      value: estimatedSearchTotal,
      delta: conversationTotal === null && documentTotal === null ? 567 : todayConversations * 3,
      icon: Search,
      iconClass: "bg-sky-50 text-sky-600",
    },
    {
      label: "活跃用户数",
      value: resolvedUserTotal,
      delta: userTotal === null ? 123 : todayUsers,
      icon: Users,
      iconClass: "bg-blue-50 text-blue-600",
    },
  ];

  const categoryData = useMemo(() => buildCategoryData(documents), [documents]);
  const operationRows = useMemo(
    () => buildOperationRows(documents, conversations),
    [documents, conversations],
  );

  const lineOption = useMemo(
    () => ({
      animationDuration: 700,
      color: ["#2f8cff"],
      grid: { left: 42, right: 18, top: 24, bottom: 30 },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15, 23, 42, 0.88)",
        borderWidth: 0,
        textStyle: { color: "#fff" },
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: trendLabels,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#e2e8f0" } },
        axisLabel: { color: "#94a3b8", fontSize: 12 },
      },
      yAxis: {
        type: "value",
        min: 0,
        splitNumber: 6,
        axisLabel: { color: "#94a3b8", fontSize: 12 },
        splitLine: { lineStyle: { color: "#e5edf6", type: "dashed" } },
      },
      series: [
        {
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 8,
          showSymbol: true,
          data: trendSeries[range],
          lineStyle: { width: 3, color: "#3d8cff" },
          itemStyle: { color: "#ffffff", borderColor: "#3d8cff", borderWidth: 3 },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(61, 140, 255, 0.22)" },
                { offset: 1, color: "rgba(61, 140, 255, 0.02)" },
              ],
            },
          },
        },
      ],
    }),
    [range],
  );

  const pieOption = useMemo(
    () => ({
      animationDuration: 700,
      color: categoryData.map((item) => item.color),
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(15, 23, 42, 0.88)",
        borderWidth: 0,
        textStyle: { color: "#fff" },
        formatter: "{b}<br/>{c} ({d}%)",
      },
      series: [
        {
          type: "pie",
          radius: ["48%", "76%"],
          center: ["38%", "52%"],
          avoidLabelOverlap: true,
          label: { show: false },
          labelLine: { show: false },
          itemStyle: {
            borderColor: "#fff",
            borderWidth: 3,
          },
          data: categoryData.map((item) => ({ name: item.name, value: item.value })),
        },
      ],
      graphic: [
        {
          type: "text",
          left: "31%",
          top: "43%",
          style: {
            text: numberFormat.format(resolvedDocumentTotal),
            fill: "#1f2937",
            fontSize: 22,
            fontWeight: 700,
            textAlign: "center",
          },
        },
        {
          type: "text",
          left: "33%",
          top: "54%",
          style: {
            text: "文档总数",
            fill: "#64748b",
            fontSize: 13,
            textAlign: "center",
          },
        },
      ],
    }),
    [categoryData, resolvedDocumentTotal],
  );

  return (
    <div className="min-h-screen overflow-auto bg-slate-50 p-6">
      <Script
        src="https://cdn.jsdelivr.net/npm/echarts@5.6.0/dist/echarts.min.js"
        strategy="afterInteractive"
        onLoad={() => setChartsReady(Boolean(window.echarts))}
        onReady={() => setChartsReady(Boolean(window.echarts))}
      />

      <div className="grid gap-4 xl:grid-cols-5 md:grid-cols-2">
        {metricCards.map((item) => {
          const Icon = item.icon;
          return (
            <section
              key={item.label}
              className="rounded-xl border border-slate-200/80 bg-white px-6 py-5 shadow-card"
            >
              <div className="flex items-center gap-4">
                <div className={cn("grid h-14 w-14 place-items-center rounded-full", item.iconClass)}>
                  <Icon size={28} strokeWidth={2.1} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-500">{item.label}</div>
                  <div className="mt-2 text-2xl font-semibold tracking-normal text-slate-900">
                    {numberFormat.format(item.value)}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    <span className="text-slate-400">较昨日</span>
                    <DeltaBadge value={item.delta} />
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
        <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-card">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-800">访问趋势</h2>
              <Info size={15} className="text-slate-300" />
            </div>
            <div className="ml-auto inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              {[
                { key: "today", label: "今日" },
                { key: "week", label: "近7日" },
                { key: "month", label: "近30日" },
              ].map((item) => (
                <button
                  key={item.key}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition",
                    range === item.key
                      ? "bg-brand-600 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-800",
                  )}
                  onClick={() => setRange(item.key as RangeKey)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <EChart option={lineOption} ready={chartsReady} className="h-[270px]" />
        </section>

        <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-800">文档分类占比</h2>
            <Info size={15} className="text-slate-300" />
          </div>
          <div className="grid min-h-[270px] items-center gap-2 md:grid-cols-[1fr_0.95fr]">
            <EChart option={pieOption} ready={chartsReady} className="h-[260px]" />
            <div className="space-y-4 pr-2">
              {categoryData.map((item) => {
                const percent = (item.value / categoryData.reduce((sum, i) => sum + i.value, 0)) * 100;
                return (
                  <div key={item.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 text-sm">
                    <div className="flex min-w-0 items-center gap-2 text-slate-700">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="truncate">{item.name}</span>
                    </div>
                    <span className="font-medium tabular-nums text-slate-500">
                      {numberFormat.format(item.value)}
                    </span>
                    <span className="w-14 text-right tabular-nums text-slate-500">
                      {percent.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">近期操作记录</h2>
          <Link
            href="/documents"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-brand-200 hover:text-brand-600"
          >
            查看更多
          </Link>
        </div>
        <div className="overflow-hidden rounded-lg border border-slate-100">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">操作时间</th>
                <th className="px-4 py-3">操作用户</th>
                <th className="px-4 py-3">操作类型</th>
                <th className="px-4 py-3">操作内容</th>
                <th className="px-4 py-3">相关文档</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {operationRows.map((row, index) => {
                const tone = operationTone[row.type];
                const Icon = tone.icon;
                return (
                  <tr key={`${row.time}-${index}`} className="bg-white text-slate-600 hover:bg-slate-50/70">
                    <td className="px-4 py-3 tabular-nums text-slate-500">{row.time}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{row.user}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className={cn("grid h-6 w-6 place-items-center rounded-md", tone.className)}>
                          <Icon size={14} />
                        </span>
                        {tone.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.content}</td>
                    <td className="px-4 py-3">
                      {row.relatedHref ? (
                        <Link href={row.relatedHref} className="font-medium text-brand-600 hover:text-brand-700">
                          {row.related}
                        </Link>
                      ) : (
                        <span className={row.related === "-" ? "text-slate-400" : "font-medium text-brand-600"}>
                          {row.related}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function EChart({
  option,
  ready,
  className,
}: {
  option: Record<string, unknown>;
  ready: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ready || !ref.current || !window.echarts) return;

    const chart = window.echarts.getInstanceByDom(ref.current) || window.echarts.init(ref.current);
    chart.setOption(option, true);

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);

    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [option, ready]);

  return (
    <div className={cn("relative w-full", className)}>
      <div ref={ref} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
          图表加载中
        </div>
      )}
    </div>
  );
}

function buildCategoryData(documents: DocumentDto[]): CategoryItem[] {
  return fallbackCategories;
}

function buildOperationRows(documents: DocumentDto[], conversations: Conversation[]): OperationRow[] {
  const docRows: OperationRow[] = documents.slice(0, 4).map((doc, index) => {
    const createdAt = new Date(doc.createdAt).getTime();
    const updatedAt = new Date(doc.updatedAt).getTime();
    const isUpload = Math.abs(updatedAt - createdAt) < 60 * 1000 || index % 2 === 0;

    return {
      time: formatDateTime(doc.updatedAt),
      user: doc.ownerName || "系统用户",
      type: isUpload ? "upload" : "update",
      content: `${isUpload ? "上传了文档" : "更新了文档"}《${doc.title}》`,
      related: doc.title,
      relatedHref: "/documents",
    };
  });

  const qaRows: OperationRow[] = conversations.slice(0, 1).map((item) => ({
    time: formatDateTime(item.updatedAt),
    user: "当前用户",
    type: "qa",
    content: `通过AI问答获取了答案`,
    related: item.title || "-",
  }));

  const rows = [...docRows, ...qaRows].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  if (rows.length > 0) return rows.slice(0, 5);

  return [
    {
      time: relativeTime(10),
      user: "张三",
      type: "upload",
      content: "上传了文档《产品使用手册.pdf》",
      related: "产品使用手册.pdf",
      relatedHref: "/documents",
    },
    {
      time: relativeTime(15),
      user: "李四",
      type: "update",
      content: "更新了文档《企业安全管理制度.docx》",
      related: "企业安全管理制度.docx",
      relatedHref: "/documents",
    },
    {
      time: relativeTime(20),
      user: "王五",
      type: "delete",
      content: "删除了文档《旧版合同模板.docx》",
      related: "旧版合同模板.docx",
    },
    {
      time: relativeTime(25),
      user: "赵六",
      type: "login",
      content: "用户登录系统",
      related: "-",
    },
    {
      time: relativeTime(30),
      user: "孙七",
      type: "qa",
      content: "通过AI问答获取了答案",
      related: "-",
    },
  ];
}

function isSameDay(value: string, day: Date) {
  const date = new Date(value);
  return (
    date.getFullYear() === day.getFullYear() &&
    date.getMonth() === day.getMonth() &&
    date.getDate() === day.getDate()
  );
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDelta(value: number) {
  return `${value > 0 ? "+" : ""}${numberFormat.format(value)}`;
}

// 环比徽标：红涨绿跌（国内约定），零/无变化用中性灰、不显箭头
function DeltaBadge({ value }: { value: number }) {
  const isUp = value > 0;
  const isDown = value < 0;
  const Arrow = isUp ? ArrowUp : isDown ? ArrowDown : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-semibold tabular-nums",
        isUp ? "text-rose-500" : isDown ? "text-emerald-600" : "text-slate-400",
      )}
    >
      {formatDelta(value)}
      {Arrow && <Arrow size={15} strokeWidth={2.4} />}
    </span>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function relativeTime(minutesAgo: number) {
  return formatDateTime(new Date(Date.now() - minutesAgo * 60 * 1000).toISOString());
}
