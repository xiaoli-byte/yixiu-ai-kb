"use client";

import { Bookmark, Loader2, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import type { GraphSavedView } from "@/types/api";

interface GraphSavedViewsProps {
  views: GraphSavedView[];
  activeViewId?: string | null;
  busy?: boolean;
  onSave: (input: { name: string; visibility: "PRIVATE" | "SHARED" }) => Promise<void>;
  onApply: (view: GraphSavedView) => void;
  onDelete: (id: string) => Promise<void>;
}

export function GraphSavedViews({
  views,
  activeViewId,
  busy,
  onSave,
  onApply,
  onDelete,
}: GraphSavedViewsProps) {
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"PRIVATE" | "SHARED">("PRIVATE");

  const save = async () => {
    if (!name.trim()) return;
    await onSave({ name: name.trim(), visibility });
    setName("");
  };

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <Bookmark size={16} className="text-brand-600" />
        <h2 className="text-sm font-semibold text-slate-800">保存视图</h2>
      </div>

      <div className="space-y-2">
        <input
          className="input h-10"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="视图名称"
        />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <select
            className="input h-10"
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as "PRIVATE" | "SHARED")}
            aria-label="视图可见性"
          >
            <option value="PRIVATE">仅自己</option>
            <option value="SHARED">团队共享</option>
          </select>
          <button
            className="btn-primary h-10 min-w-[92px]"
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => void save()}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            保存
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {views.length === 0 ? (
          <div className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">
            暂无保存视图
          </div>
        ) : (
          views.map((view) => (
            <div
              key={view.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-slate-100 px-3 py-2"
            >
              <button
                className="min-w-0 text-left"
                type="button"
                onClick={() => onApply(view)}
                title={view.name}
              >
                <span className="block truncate text-sm font-medium text-slate-700">{view.name}</span>
                <span className="text-[11px] text-slate-400">
                  {view.visibility === "SHARED" ? "共享" : "私有"}
                  {activeViewId === view.id ? " · 当前" : ""}
                </span>
              </button>
              <button
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                type="button"
                onClick={() => void onDelete(view.id)}
                disabled={busy}
                aria-label={`删除视图 ${view.name}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
