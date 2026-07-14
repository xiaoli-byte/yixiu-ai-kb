"use client";
// 日期范围选择：自建月历 popover（无系统日期控件，跨系统一致外观）
// - 契约与原生 type=date 一致：进出均为 "YYYY-MM-DD" 字符串（空串表示未选）
// - 两次点击成区间（自动取 min/max）；悬停预览待选区间；快捷预设（今天/近7天/近30天/本月）
// - 键盘：方向键移动焦点日、Home/End 跳周首尾、PageUp/Down 翻月、Enter 选中、Esc 关闭
// - 复用 select-pop 动画与设计 token，尊重 prefers-reduced-motion（全局已处理）
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dayjs, { type Dayjs } from "dayjs";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DATE_FMT as FMT,
  buildMonthGrid,
  isInsideRange,
  mondayOffset,
  orderRange,
  parseISO,
  rangeBounds,
} from "./dateRange";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"]; // 周一为首

export interface DateRange {
  from: string;
  to: string;
}

interface DateRangeFieldProps {
  from: string;
  to: string;
  onChange: (range: DateRange) => void;
  placeholder?: string;
  ariaLabel?: string;
  size?: "sm" | "md";
  className?: string;
  triggerClassName?: string;
}

const SIZE = {
  sm: "h-8 text-xs",
  md: "h-10 text-xs",
} as const;

export function DateRangeField({
  from,
  to,
  onChange,
  placeholder = "选择日期范围",
  ariaLabel = "日期范围",
  size = "sm",
  className,
  triggerClassName,
}: DateRangeFieldProps) {
  const [open, setOpen] = useState(false);
  // 弹层贴近视口右缘时改为右对齐，避免溢出撑出横向滚动条
  const [alignRight, setAlignRight] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  const fromD = useMemo(() => parseISO(from), [from]);
  const toD = useMemo(() => parseISO(to), [to]);

  // 当前展示的月份 & 键盘焦点日
  const [viewMonth, setViewMonth] = useState<Dayjs>(() => fromD ?? dayjs().startOf("month"));
  const [focused, setFocused] = useState<Dayjs>(() => fromD ?? dayjs());
  const [hover, setHover] = useState<Dayjs | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setHover(null);
  }, []);

  // 打开时同步展示月份/焦点到已选起点（或今天）
  useEffect(() => {
    if (!open) return;
    const anchor = fromD ?? dayjs();
    setViewMonth(anchor.startOf("month"));
    setFocused(anchor);
    // 聚焦网格以接管键盘
    const t = window.setTimeout(() => gridRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);

  // 打开时测量：左对齐会溢出视口右缘则翻转为右对齐（绘制前完成，无闪动）
  useLayoutEffect(() => {
    if (!open) {
      setAlignRight(false);
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    const popupWidth = popupRef.current?.offsetWidth ?? 0;
    if (!rect || !popupWidth) return;
    const overflowsRight = rect.left + popupWidth > window.innerWidth - 8;
    const fitsLeftward = rect.right - popupWidth >= 8;
    setAlignRight(overflowsRight && fitsLeftward);
  }, [open]);

  // 焦点日变化时保证在可视月份内
  useEffect(() => {
    if (!focused.isSame(viewMonth, "month")) setViewMonth(focused.startOf("month"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  // 6 周固定网格（42 天），周一为首
  const cells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  // 选择逻辑：首次点/已成完整区间 → 起新区间；第二次点 → 取 min/max 成区间并关闭
  function pick(day: Dayjs) {
    if (!fromD || (fromD && toD)) {
      onChange({ from: day.format(FMT), to: "" });
      setHover(null);
      return;
    }
    // fromD 存在、toD 为空：与起点规整为 {from<=to}
    onChange(orderRange(fromD, day));
    close();
  }

  // 待选预览终点（仅选了起点、尚未定终点时）
  const previewEnd = fromD && !toD ? hover : null;
  const bounds = rangeBounds(fromD, toD, previewEnd);

  function dayState(d: Dayjs) {
    const isFrom = fromD?.isSame(d, "day") ?? false;
    const isTo = toD?.isSame(d, "day") ?? false;
    const inRange = isInsideRange(d, bounds);
    const isEnd = isFrom || isTo || (!!previewEnd && previewEnd.isSame(d, "day"));
    return { isEnd, inRange, isFrom, isTo };
  }

  function onKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        setFocused((f) => f.subtract(1, "day"));
        break;
      case "ArrowRight":
        e.preventDefault();
        setFocused((f) => f.add(1, "day"));
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocused((f) => f.subtract(7, "day"));
        break;
      case "ArrowDown":
        e.preventDefault();
        setFocused((f) => f.add(7, "day"));
        break;
      case "Home":
        e.preventDefault();
        setFocused((f) => f.subtract(mondayOffset(f), "day"));
        break;
      case "End":
        e.preventDefault();
        setFocused((f) => f.add(6 - mondayOffset(f), "day"));
        break;
      case "PageUp":
        e.preventDefault();
        setFocused((f) => f.subtract(1, "month"));
        break;
      case "PageDown":
        e.preventDefault();
        setFocused((f) => f.add(1, "month"));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        pick(focused);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        close();
        break;
    }
  }

  function applyPreset(fromDay: Dayjs, toDay: Dayjs) {
    onChange({ from: fromDay.format(FMT), to: toDay.format(FMT) });
    close();
  }

  const PRESETS: Array<{ label: string; run: () => void }> = [
    { label: "今天", run: () => applyPreset(dayjs(), dayjs()) },
    { label: "近 7 天", run: () => applyPreset(dayjs().subtract(6, "day"), dayjs()) },
    { label: "近 30 天", run: () => applyPreset(dayjs().subtract(29, "day"), dayjs()) },
    { label: "本月", run: () => applyPreset(dayjs().startOf("month"), dayjs()) },
  ];

  const hasValue = !!fromD || !!toD;
  const triggerLabel = fromD
    ? toD && !toD.isSame(fromD, "day")
      ? `${fromD.format(FMT)} 至 ${toD.format(FMT)}`
      : fromD.format(FMT)
    : placeholder;

  return (
    <div ref={containerRef} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white pl-3 pr-2 text-slate-800 outline-none transition",
          "hover:bg-slate-50 focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30",
          SIZE[size],
          triggerClassName,
        )}
      >
        <CalendarDays size={14} className="shrink-0 text-slate-400" />
        <span className={cn("tabular whitespace-nowrap", !hasValue && "text-slate-400")}>{triggerLabel}</span>
        {hasValue ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="清除日期"
            className="ml-0.5 grid h-4 w-4 place-items-center rounded text-slate-400 hover:text-slate-600"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ from: "", to: "" });
            }}
          >
            <X size={13} />
          </span>
        ) : (
          <ChevronRight size={13} className="pointer-events-none rotate-90 text-slate-400" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div
          ref={popupRef}
          role="dialog"
          aria-label={ariaLabel}
          className={cn(
            "absolute top-[calc(100%+4px)] z-20 w-[17rem] overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-raised",
            alignRight ? "right-0" : "left-0",
          )}
          style={{ animation: "select-pop 160ms ease-out" }}
        >
          {/* 月份导航 */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="上一月"
              className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
              onClick={() => setViewMonth((m) => m.subtract(1, "month"))}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium text-slate-800">{viewMonth.format("YYYY 年 MM 月")}</span>
            <button
              type="button"
              aria-label="下一月"
              className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
              onClick={() => setViewMonth((m) => m.add(1, "month"))}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* 星期表头 */}
          <div className="grid grid-cols-7 text-center text-[11px] text-slate-400">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">{w}</div>
            ))}
          </div>

          {/* 日网格 */}
          <div
            ref={gridRef}
            role="grid"
            aria-label={ariaLabel}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onMouseLeave={() => setHover(null)}
            className="grid grid-cols-7 outline-none"
          >
            {cells.map((d) => {
              const other = !d.isSame(viewMonth, "month");
              const isToday = d.isSame(dayjs(), "day");
              const isFocus = d.isSame(focused, "day");
              const { isEnd, inRange } = dayState(d);
              const cellId = `${baseId}-${d.format(FMT)}`;
              return (
                <div key={cellId} className={cn("py-0.5", inRange && "bg-brand-50")}>
                  <button
                    id={cellId}
                    type="button"
                    role="gridcell"
                    aria-selected={isEnd}
                    tabIndex={isFocus ? 0 : -1}
                    onMouseEnter={() => setHover(d)}
                    onClick={() => pick(d)}
                    onFocus={() => setFocused(d)}
                    className={cn(
                      "mx-auto grid h-8 w-8 place-items-center rounded-lg text-xs transition",
                      other ? "text-slate-300" : "text-slate-700",
                      !isEnd && !inRange && "hover:bg-slate-100",
                      inRange && !isEnd && "text-brand-700 rounded-none hover:bg-brand-100",
                      isEnd && "bg-brand-600 font-medium text-white hover:bg-brand-700",
                      isFocus && !isEnd && "ring-2 ring-brand-500/40",
                      isToday && !isEnd && "font-semibold text-brand-600",
                    )}
                  >
                    {d.date()}
                  </button>
                </div>
              );
            })}
          </div>

          {/* 快捷预设 + 清除 */}
          <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={p.run}
                className="rounded-md px-2 py-1 text-[11px] text-slate-600 hover:bg-brand-50 hover:text-brand-700"
              >
                {p.label}
              </button>
            ))}
            {hasValue && (
              <button
                type="button"
                onClick={() => {
                  onChange({ from: "", to: "" });
                  close();
                }}
                className="ml-auto rounded-md px-2 py-1 text-[11px] text-slate-400 hover:text-slate-600"
              >
                清除
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
