import { Archive, FileText, FolderOpen, Users } from "lucide-react";
import type { DocumentListQuery } from "@/services/documents";
import { cn } from "@/lib/utils";

export type DocumentScope = NonNullable<DocumentListQuery["scope"]>;

interface DocumentScopeNavProps {
  value: DocumentScope;
  onChange: (scope: DocumentScope) => void;
}

const SCOPES: Array<{
  value: DocumentScope;
  label: string;
  icon: typeof FileText;
}> = [
  { value: "mine", label: "我的文档", icon: FileText },
  { value: "public", label: "公共文档", icon: FolderOpen },
  { value: "department", label: "部门文档", icon: Users },
  { value: "archive", label: "文档归档", icon: Archive },
];

export function DocumentScopeNav({ value, onChange }: DocumentScopeNavProps) {
  return (
    <aside className="w-56 shrink-0 border-r border-slate-200 bg-slate-50/80 px-3 py-4">
      <div className="mb-3 px-2 text-xs font-medium text-slate-500">文档范围</div>
      <nav className="space-y-1">
        {SCOPES.map((item) => {
          const Icon = item.icon;
          const selected = value === item.value;
          return (
            <button
              key={item.value}
              className={cn(
                "flex h-9 w-full items-center gap-2 rounded px-2 text-left text-[13px] transition",
                selected
                  ? "bg-brand-50 font-medium text-brand-700 ring-1 ring-brand-100"
                  : "text-slate-700 hover:bg-white hover:text-slate-950",
              )}
              onClick={() => onChange(item.value)}
              type="button"
            >
              <Icon size={16} className={selected ? "text-brand-600" : "text-slate-500"} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
