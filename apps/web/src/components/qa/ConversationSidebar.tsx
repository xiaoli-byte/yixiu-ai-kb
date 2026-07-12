"use client";
// 会话历史侧边栏：新建 / 切换 / 删除会话
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conversation } from "./types";

export interface ConversationSidebarProps {
  open: boolean;
  conversations: Conversation[];
  activeId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ConversationSidebar({
  open,
  conversations,
  activeId,
  onNew,
  onSelect,
  onDelete,
}: ConversationSidebarProps) {
  return (
    <aside
      className={cn(
        "shrink-0 bg-white border-r border-slate-200 flex flex-col transition-all duration-200",
        open ? "w-72" : "w-0 overflow-hidden border-0",
      )}
    >
      <div className="p-4 border-b border-slate-200 flex items-center justify-between min-w-[288px]">
        <span className="font-semibold text-sm">会话历史</span>
        <button className="btn-ghost px-2 py-1 text-xs flex items-center gap-1" onClick={onNew}>
          <Plus size={12} /> 新建
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.length === 0 && (
          <div className="text-xs text-slate-400 text-center py-8">暂无会话记录</div>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={cn(
              "group relative rounded-lg transition",
              activeId === c.id ? "bg-brand-50" : "hover:bg-slate-50",
            )}
          >
            <button className="w-full text-left px-3 py-2.5 pr-8" onClick={() => onSelect(c.id)}>
              <div className="text-sm font-medium text-slate-800 truncate">{c.title}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                {c.messageCount} 条 · {new Date(c.updatedAt).toLocaleDateString("zh-CN")}
              </div>
            </button>
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(c.id);
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

export default ConversationSidebar;
