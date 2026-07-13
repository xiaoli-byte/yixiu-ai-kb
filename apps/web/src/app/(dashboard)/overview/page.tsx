"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Edit3,
  FilePlus2,
  FileText,
  Info,
  MessageCircle,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import overviewApi, {
  type OverviewActivity,
  type OverviewActivityType,
  type OverviewCategory,
  type OverviewMetrics,
  type OverviewTrendPoint,
  type OverviewTrendRange,
} from "@/services/overview";
import { cn } from "@/lib/utils";

const numberFormat = new Intl.NumberFormat("zh-CN");

// 分类占比配色（按索引循环分配，AI 品牌蓝领衔）
const CATEGORY_COLORS = [
  "#4D6BFE",
  "#49c785",
  "#ffb52e",
  "#9d76d8",
  "#67bde8",
  "#f27a7a",
  "#5ac8b8",
  "#b0b7c3",
];

const activityTone: Record<OverviewActivityType, { label: string; icon: typeof Upload; className: string }> = {
  upload: { label: "上传文档", icon: Upload, className: "text-brand-600 bg-brand-50" },
  update: { label: "更新文档", icon: Edit3, className: "text-slate-600 bg-slate-100" },
  delete: { label: "删除文档", icon: Trash2, className: "text-rose-600 bg-rose-50" },
  qa: { label: "AI问答", icon: MessageCircle, className: "text-sky-600 bg-sky-50" },
};

const rangeTabs: Array<{ key: OverviewTrendRange; label: string }> = [
  { key: "today", label: "今日" },
  { key: "week", label: "近7日" },
  { key: "month", label: "近30日" },
];

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

interface MetricCard {
  label: string;
  value: number;
  icon: typeof FileText;
  iconClass: string;
  delta?: number;
  deltaLabel?: string;
  note?: string;
}

export default function OverviewPage() {
  const [range, setRange] = useState<OverviewTrendRange>("today");
  const [chartsReady, setChartsReady] = useState(false);
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [trend, setTrend] = useState<OverviewTrendPoint[]>([]);
  const [categories, setCategories] = useState<OverviewCategory[]>([]);
  const [activities, setActivities] = useState<OverviewActivity[]>([]);

  // 首屏并行拉取指标 / 分类 / 操作记录
  useEffect(() => {
    let canceled = false;
    void (async () => {
      const [m, c, a] = await Promise.allSettled([
        overviewApi.metrics(),
        overviewApi.categories(),
        overviewApi.recentActivities(8),
      ]);
      if (canceled) return;
      if (m.status === "fulfilled") setMetrics(m.value);
      if (c.status === "fulfilled") setCategories(c.value);
      if (a.status === "fulfilled") setActivities(a.value);
    })();
    return () => {
      canceled = true;
    };
  }, []);

  // 趋势随时间范围切换重新拉取
  useEffect(() => {
    let canceled = false;
    void overviewApi
      .trend(range)
      .then((points) => {
        if (!canceled) setTrend(points);
      })
      .catch(() => {
        if (!canceled) setTrend([]);
      });
    return () => {
      canceled = true;
    };
  }, [range]);

  useEffect(() => {
    if (window.echarts) setChartsReady(true);
  }, []);

  const categoryData = useMemo(
    () => categories.map((item, index) => ({ ...item, color: CATEGORY_COLORS[index % CATEGORY_COLORS.length] })),
    [categories],
  );
  const categoryTotal = useMemo(() => categoryData.reduce((sum, item) => sum + item.value, 0), [categoryData]);
  const documentTotal = metrics?.documentTotal ?? 0;

  const metricCards: MetricCard[] = [
    {
      label: "文档总数",
      value: metrics?.documentTotal ?? 0,
      delta: metrics?.documentToday,
      deltaLabel: "今日新增",
      icon: FileText,
      iconClass: "bg-brand-50 text-brand-600",
    },
    {
      label: "今日新增文档",
      value: metrics?.documentToday ?? 0,
      delta: metrics ? metrics.documentToday - metrics.documentYesterday : undefined,
      deltaLabel: "较昨日",
      icon: FilePlus2,
      iconClass: "bg-blue-50 text-blue-600",
    },
    {
      label: "AI问答次数",
      value: metrics?.qaTotal ?? 0,
      delta: metrics?.qaToday,
      deltaLabel: "今日",
      icon: Bot,
      iconClass: "bg-indigo-50 text-indigo-600",
    },
    {
      label: "用户搜索次数",
      value: metrics?.searchTotal ?? 0,
      delta: metrics?.searchToday,
      deltaLabel: "今日",
      icon: Search,
      iconClass: "bg-sky-50 text-sky-600",
    },
    {
      label: "活跃用户数",
      value: metrics?.activeUsers7d ?? 0,
      note: "近7天 · 搜索/问答去重",
      icon: Users,
      iconClass: "bg-emerald-50 text-emerald-600",
    },
  ];

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
        data: trend.map((point) => point.label),
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
          data: trend.map((point) => point.value),
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
    [trend],
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
          itemStyle: { borderColor: "#fff", borderWidth: 3 },
          data: categoryData.map((item) => ({ name: item.name, value: item.value })),
        },
      ],
      graphic: [
        {
          type: "text",
          left: "31%",
          top: "43%",
          style: {
            text: numberFormat.format(documentTotal),
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
          style: { text: "文档总数", fill: "#64748b", fontSize: 13, textAlign: "center" },
        },
      ],
    }),
    [categoryData, documentTotal],
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
                  <div className="mt-2 text-2xl font-semibold tracking-normal text-slate-900 tabular-nums">
                    {numberFormat.format(item.value)}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    {item.note ? (
                      <span className="text-xs text-slate-400">{item.note}</span>
                    ) : (
                      <>
                        <span className="text-slate-400">{item.deltaLabel}</span>
                        <DeltaBadge value={item.delta ?? 0} />
                      </>
                    )}
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
              <span className="text-xs text-slate-400">按搜索/浏览事件统计</span>
            </div>
            <div className="ml-auto inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              {rangeTabs.map((item) => (
                <button
                  key={item.key}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition",
                    range === item.key
                      ? "bg-brand-600 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-800",
                  )}
                  onClick={() => setRange(item.key)}
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
            <span className="text-xs text-slate-400">按文件夹</span>
          </div>
          {categoryData.length === 0 ? (
            <div className="grid h-[260px] place-items-center text-sm text-slate-400">暂无分类数据</div>
          ) : (
            <div className="grid min-h-[270px] items-center gap-2 md:grid-cols-[1fr_0.95fr]">
              <EChart option={pieOption} ready={chartsReady} className="h-[260px]" />
              <div className="space-y-4 pr-2">
                {categoryData.map((item) => {
                  const percent = categoryTotal > 0 ? (item.value / categoryTotal) * 100 : 0;
                  return (
                    <div key={item.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 text-sm">
                      <div className="flex min-w-0 items-center gap-2 text-slate-700">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="truncate">{item.name}</span>
                      </div>
                      <span className="font-medium tabular-nums text-slate-500">
                        {numberFormat.format(item.value)}
                      </span>
                      <span className="w-14 text-right tabular-nums text-slate-500">{percent.toFixed(2)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">操作时间</th>
                <th className="px-4 py-3">操作用户</th>
                <th className="px-4 py-3">操作类型</th>
                <th className="px-4 py-3">操作内容</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activities.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-slate-400" colSpan={4}>
                    暂无操作记录
                  </td>
                </tr>
              ) : (
                activities.map((row, index) => {
                  const tone = activityTone[row.type];
                  const Icon = tone.icon;
                  return (
                    <tr key={`${row.time}-${index}`} className="bg-white text-slate-600 hover:bg-slate-50/70">
                      <td className="px-4 py-3 tabular-nums text-slate-500">{formatDateTime(row.time)}</td>
                      <td className="px-4 py-3 font-medium text-slate-700">{row.actor || "系统用户"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span className={cn("grid h-6 w-6 place-items-center rounded-md", tone.className)}>
                            <Icon size={14} />
                          </span>
                          {tone.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <span className="line-clamp-1">{describeActivity(row)}</span>
                      </td>
                    </tr>
                  );
                })
              )}
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
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">图表加载中</div>
      )}
    </div>
  );
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
      {`${value > 0 ? "+" : ""}${numberFormat.format(value)}`}
      {Arrow && <Arrow size={15} strokeWidth={2.4} />}
    </span>
  );
}

function describeActivity(row: OverviewActivity) {
  const title = row.title || "-";
  switch (row.type) {
    case "upload":
      return `上传了文档《${title}》`;
    case "update":
      return `更新了文档《${title}》`;
    case "delete":
      return `删除了文档《${title}》`;
    case "qa":
      return `AI问答：${title}`;
    default:
      return title;
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
