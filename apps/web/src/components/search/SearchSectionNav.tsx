import { Filter, Flame, History } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchSectionNavProps {
  compact?: boolean;
  onFilterClick?: () => void;
}

const SECTIONS = [
  { id: "search-history", label: "搜索历史", icon: History },
  { id: "hot-search", label: "热门搜索", icon: Flame },
  { id: "search-filters", label: "搜索筛选", icon: Filter },
];

export function SearchSectionNav({ compact = false, onFilterClick }: SearchSectionNavProps) {
  function handleClick(id: string) {
    if (id === "search-filters") {
      onFilterClick?.();
    }

    if (typeof document === "undefined") return;
    document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  return (
    <aside
      aria-label="搜索页面区块导航"
      className={cn(
        "hidden shrink-0 border-r border-slate-200 bg-slate-50/80 px-3 py-4 md:block",
        compact ? "w-44" : "w-48",
      )}
    >
      <div className="mb-3 px-2 text-xs font-medium text-slate-500">智能搜索</div>
      <nav className="space-y-1">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              className="flex h-9 w-full items-center gap-2 rounded px-2 text-left text-[13px] text-slate-700 transition hover:bg-white hover:text-brand-700"
              onClick={() => handleClick(section.id)}
              type="button"
            >
              <Icon size={15} className="text-slate-500" />
              <span className="truncate">{section.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
