"use client";

import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  placeholder: string;
  value: string;
  options: SearchableSelectOption[];
  loading?: boolean;
  onChange: (value: string) => void;
  className?: string;
}

export function SearchableSelect({
  placeholder,
  value,
  options,
  loading,
  onChange,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value],
  );

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return options;
    return options.filter((opt) => opt.label.toLowerCase().includes(keyword));
  }, [options, search]);

  function handleSelect(optionValue: string) {
    onChange(optionValue);
    setOpen(false);
    setSearch("");
  }

  function handleClear(event: React.MouseEvent) {
    event.stopPropagation();
    onChange("");
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        className="inline-flex h-8 w-32 items-center justify-between gap-1 rounded border border-slate-200 bg-white px-2 text-xs text-slate-800 outline-none transition hover:bg-slate-50 focus:border-brand-500"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={cn("min-w-0 truncate", !selectedOption && "text-slate-400")}>
          {loading ? "加载中..." : selectedOption ? selectedOption.label : placeholder}
        </span>
        {selectedOption ? (
          <X
            size={13}
            className="shrink-0 text-slate-400 hover:text-slate-600"
            onClick={handleClear}
          />
        ) : (
          <ChevronDown size={13} className="shrink-0 text-slate-400" />
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-30 w-56 rounded border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-1.5">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="h-7 w-full rounded border border-slate-200 pl-7 pr-2 text-xs outline-none focus:border-brand-500"
                placeholder="搜索..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {loading ? (
              <div className="px-3 py-2 text-xs text-slate-400">加载中...</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-400">
                {options.length === 0 ? "暂无数据" : "无匹配结果"}
              </div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={cn(
                    "flex w-full items-center px-3 py-1.5 text-left text-xs hover:bg-slate-50",
                    opt.value === value ? "font-medium text-brand-600" : "text-slate-700",
                  )}
                  onClick={() => handleSelect(opt.value)}
                >
                  <span className="min-w-0 truncate">{opt.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
