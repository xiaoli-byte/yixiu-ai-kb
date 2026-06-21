"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  Search,
  MessageSquare,
  Network,
  LogOut,
  Files,
  Settings,
} from "lucide-react";
import { useAuth } from "@/lib/store";
import { Role, ROLE_LABELS } from "@/types/permissions";
import { cn } from "@/lib/utils";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, accessToken, logout } = useAuth();

  // 支持 super_admin 和 admin
  const isAdmin = user?.role === Role.SUPER_ADMIN || user?.role === Role.ADMIN;

  const NAV = [
    { href: "/documents", label: "文档管理", icon: Files },
    { href: "/search", label: "智能检索", icon: Search },
    { href: "/qa", label: "AI 问答", icon: MessageSquare },
    { href: "/graph", label: "知识图谱", icon: Network },
    ...(isAdmin ? [{ href: "/settings", label: "系统设置", icon: Settings }] : []),
  ];

  if (!accessToken) return null;

  // 获取角色显示文本
  const getRoleLabel = (role?: string) => {
    if (role === Role.SUPER_ADMIN) return ROLE_LABELS[Role.SUPER_ADMIN];
    if (role === Role.ADMIN) return ROLE_LABELS[Role.ADMIN];
    if (role === Role.EDITOR) return ROLE_LABELS[Role.EDITOR];
    return ROLE_LABELS[Role.VIEWER];
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
        <aside className="w-60 shrink-0 bg-white border-r border-slate-200 flex flex-col">
          <div className="h-16 flex items-center gap-2 px-5 border-b border-slate-200">
            <div className="h-8 w-8 rounded-lg bg-brand-600 text-white grid place-items-center">
              <BookOpen size={16} />
            </div>
            <span className="font-semibold">AI 知识库</span>
          </div>
          <nav className="flex-1 p-3 space-y-1">
            {NAV.map((n) => {
              const active = pathname.startsWith(n.href);
              const Icon = n.icon;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition",
                    active
                      ? "bg-brand-50 text-brand-700 font-medium"
                      : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  <Icon size={16} />
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="p-3 border-t border-slate-200">
            <div className="px-3 py-2 mb-2">
              <div className="text-sm font-medium truncate">{user?.name || "用户"}</div>
              <div className="text-xs text-slate-500 truncate">{user?.email}</div>
              <div className="text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                {getRoleLabel(user?.role)}
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                router.push("/login");
              }}
              className="w-full btn-ghost justify-start"
            >
              <LogOut size={14} /> 退出
            </button>
          </div>
        </aside>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
  );
}