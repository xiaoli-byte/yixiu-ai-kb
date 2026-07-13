import { Minus, Pin, TrendingDown, TrendingUp } from "lucide-react";
import type { HotSearchItem, HotSearchQuery } from "@/services/search";
import { cn } from "@/lib/utils";

const RANGE_TABS: Array<{ value: NonNullable<HotSearchQuery["range"]>; label: string }> = [
  { value: "today", label: "今日" },
  { value: "week", label: "本周" },
  { value: "month", label: "本月" },
  { value: "all", label: "全部" },
];

interface HotSearchPanelProps {
  id?: string;
  items: HotSearchItem[];
  activeRange: NonNullable<HotSearchQuery["range"]>;
  loading?: boolean;
  onRangeChange: (range: NonNullable<HotSearchQuery["range"]>) => void;
  onSelect: (keyword: string) => void;
}

export function HotSearchPanel({
  id,
  items,
  activeRange,
  loading = false,
  onRangeChange,
  onSelect,
}: HotSearchPanelProps) {
  return (
    <section className="min-w-0 scroll-mt-4" id={id}>
      <div className="flex items-center border-b border-slate-200">
        <h2 className="mr-6 pb-3 text-sm font-medium text-slate-900">热门搜索</h2>
        <div className="flex items-center gap-6">
          {RANGE_TABS.map((tab) => (
            <button
              key={tab.value}
              aria-pressed={activeRange === tab.value}
              className={cn(
                "min-h-10 border-b-2 text-[13px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                activeRange === tab.value
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-slate-600 hover:text-brand-700",
              )}
              onClick={() => onRangeChange(tab.value)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="pt-3">
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">正在加载热门搜索...</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">暂无热门搜索</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item, index) => (
              <button
                key={`${item.keyword}-${index}`}
                className="flex min-h-11 w-full items-center gap-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                onClick={() => onSelect(item.keyword)}
                type="button"
              >
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center text-[13px] font-semibold",
                    index < 3 ? "text-brand-700" : "text-slate-500",
                  )}
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-slate-900">{item.keyword}</span>
                {item.pinned && <Pin size={12} className="shrink-0 text-amber-500" />}
                <span className="shrink-0 text-xs text-slate-500">
                  {item.searchCount.toLocaleString("zh-CN")}
                </span>
                {item.trend === "up" ? (
                  <TrendingUp size={13} className="shrink-0 text-emerald-600" />
                ) : item.trend === "down" ? (
                  <TrendingDown size={13} className="shrink-0 text-rose-600" />
                ) : (
                  <Minus size={13} className="shrink-0 text-slate-400" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
