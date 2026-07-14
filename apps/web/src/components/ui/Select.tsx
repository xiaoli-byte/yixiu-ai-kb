"use client";
// 统一下拉选择：自定义 popover 菜单（跨系统一致外观），完整 listbox 无障碍语义
// - role=listbox/option + aria-selected + aria-expanded + aria-activedescendant
// - 键盘：方向键移动、Home/End、Enter/Space 选中、Esc 关闭；非搜索模式支持首字母 type-ahead
// - 尺寸 sm(h-8)/md(h-10)、可选前置图标、可选搜索框（长列表）、可选清除
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** 无障碍名称（无可见 label 时必填） */
  ariaLabel?: string;
  size?: "sm" | "md";
  leadingIcon?: ReactNode;
  /** 展示搜索框（选项较多时） */
  searchable?: boolean;
  /** 允许清除（已选时显示 X） */
  clearable?: boolean;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  /** 触发器最小宽度，默认按 size */
  triggerWidthClassName?: string;
}

const SIZE = {
  sm: { trigger: "h-8 text-xs", pad: "pl-3 pr-8", lead: "pl-8" },
  md: { trigger: "h-10 text-xs", pad: "pl-3 pr-8", lead: "pl-9" },
} as const;

export function Select({
  value,
  options,
  onChange,
  placeholder = "请选择",
  ariaLabel,
  size = "md",
  leadingIcon,
  searchable = false,
  clearable = false,
  loading = false,
  disabled = false,
  className,
  triggerClassName,
  triggerWidthClassName,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  // 弹层贴近视口右缘时改为右对齐，避免溢出撑出横向滚动条
  const [alignRight, setAlignRight] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef<{ str: string; at: number }>({ str: "", at: 0 });
  const baseId = useId();

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return options;
    return options.filter((o) => o.label.toLowerCase().includes(kw));
  }, [options, search]);

  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
    setActiveIndex(-1);
  }, []);

  // 打开时：定位到已选项，聚焦搜索框或列表
  useEffect(() => {
    if (!open) return;
    const idx = filtered.findIndex((o) => o.value === value);
    setActiveIndex(idx >= 0 ? idx : filtered.length > 0 ? 0 : -1);
    const focusTarget = searchable ? searchRef.current : listRef.current;
    focusTarget?.focus();
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

  // 活动项滚动进视口
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const node = document.getElementById(`${baseId}-opt-${activeIndex}`);
    node?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, baseId]);

  function commit(idx: number) {
    const opt = filtered[idx];
    if (!opt) return;
    onChange(opt.value);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(filtered.length - 1);
        break;
      case "Enter":
      case " ":
        // 搜索模式下空格是正常输入，不拦截
        if (e.key === " " && searchable) break;
        e.preventDefault();
        if (activeIndex >= 0) commit(activeIndex);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        close();
        break;
      default:
        // 非搜索模式：首字母 type-ahead
        if (!searchable && e.key.length === 1 && /\S/.test(e.key)) {
          const now = Date.now();
          const str = now - typeahead.current.at < 600 ? typeahead.current.str + e.key : e.key;
          typeahead.current = { str, at: now };
          const lower = str.toLowerCase();
          const hit = filtered.findIndex((o) => o.label.toLowerCase().startsWith(lower));
          if (hit >= 0) setActiveIndex(hit);
        }
    }
  }

  const sz = SIZE[size];
  const showClear = clearable && !!selected && !disabled;

  return (
    <div ref={containerRef} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={cn(
          "inline-flex items-center justify-between gap-1 rounded-lg border border-slate-200 bg-white text-slate-800 outline-none transition",
          "hover:bg-slate-50 focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30",
          "disabled:cursor-not-allowed disabled:opacity-50",
          sz.trigger,
          leadingIcon ? sz.lead : sz.pad,
          triggerWidthClassName ?? "min-w-32",
          triggerClassName,
        )}
      >
        {leadingIcon && (
          <span className="pointer-events-none absolute left-2.5 text-slate-400">{leadingIcon}</span>
        )}
        <span className={cn("min-w-0 truncate", !selected && "text-slate-400")}>
          {loading ? "加载中…" : selected ? selected.label : placeholder}
        </span>
        {showClear ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="清除选择"
            className="absolute right-2 grid h-4 w-4 place-items-center rounded text-slate-400 hover:text-slate-600"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          >
            <X size={13} />
          </span>
        ) : (
          <ChevronDown
            aria-hidden="true"
            size={13}
            className={cn("pointer-events-none absolute right-2 text-slate-400 transition-transform", open && "rotate-180")}
          />
        )}
      </button>

      {open && (
        <div
          ref={popupRef}
          className={cn(
            "absolute top-[calc(100%+4px)] z-20 min-w-[min(16rem,90vw)] max-w-[20rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-raised",
            alignRight ? "right-0" : "left-0",
          )}
          style={{ animation: "select-pop 160ms ease-out" }}
        >
          {searchable && (
            <div className="border-b border-slate-100 p-1.5">
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchRef}
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={`${baseId}-listbox`}
                  aria-activedescendant={activeIndex >= 0 ? `${baseId}-opt-${activeIndex}` : undefined}
                  className="h-7 w-full rounded-lg border border-slate-200 pl-7 pr-2 text-xs outline-none focus:border-brand-500"
                  placeholder="搜索…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={onKeyDown}
                />
              </div>
            </div>
          )}
          <div
            ref={listRef}
            id={`${baseId}-listbox`}
            role="listbox"
            aria-label={ariaLabel}
            aria-activedescendant={activeIndex >= 0 ? `${baseId}-opt-${activeIndex}` : undefined}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            className="max-h-56 overflow-y-auto py-1 outline-none"
          >
            {loading ? (
              <div className="px-3 py-2 text-xs text-slate-400">加载中…</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-400">
                {options.length === 0 ? "暂无数据" : "无匹配结果"}
              </div>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isActive = idx === activeIndex;
                return (
                  <div
                    key={opt.value || "__empty"}
                    id={`${baseId}-opt-${idx}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => commit(idx)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-xs",
                      isActive ? "bg-slate-100" : "",
                      isSelected ? "font-medium text-brand-700" : "text-slate-700",
                    )}
                  >
                    <span className="min-w-0 truncate">{opt.label}</span>
                    {isSelected && <Check size={13} className="shrink-0 text-brand-600" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
