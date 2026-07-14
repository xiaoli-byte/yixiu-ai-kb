"use client";
// 会话列表（对齐设计稿）：顶部标题 + 通栏「新建对话」按钮，会话项为卡片式（标题 + 条数/日期），当前项蓝色高亮
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
      <div className="min-w-[288px] space-y-3 border-b border-slate-200 p-4">
        <span className="text-sm font-semibold text-slate-900">会话列表</span>
        <button
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-brand-500 px-3 py-2 text-xs font-medium text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          onClick={onNew}
          type="button"
        >
          <Plus size={13} /> 新建对话
        </button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {conversations.length === 0 && (
          <div className="py-8 text-center text-xs text-slate-400">暂无会话记录</div>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={cn(
              "group relative rounded-xl border transition",
              activeId === c.id
                ? "border-brand-200 bg-brand-50/80"
                : "border-transparent hover:border-slate-200 hover:bg-slate-50",
            )}
          >
            <button className="w-full px-3 py-2.5 pr-8 text-left" onClick={() => onSelect(c.id)} type="button">
              <div className={cn("truncate text-sm font-medium", activeId === c.id ? "text-brand-700" : "text-slate-800")}>
                {c.title}
              </div>
              <div className="mt-0.5 text-xs text-slate-400 tabular">
                {c.messageCount} 条 · {new Date(c.updatedAt).toLocaleDateString("zh-CN")}
              </div>
            </button>
            <button
              aria-label="删除会话"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 opacity-0 transition hover:text-red-500 group-hover:opacity-100 focus-visible:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(c.id);
              }}
              type="button"
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
