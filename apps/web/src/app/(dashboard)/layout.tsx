"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Search,
  MessageSquare,
  LogOut,
  Files,
  Settings,
  LayoutDashboard,
  Network,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useAuth, COOKIE_SESSION } from "@/lib/store";
import { apiClient } from "@/lib/api/client";
import { FeedbackHost } from "@/components/ui/feedback";
import { Role, ROLE_LABELS } from "@/types/permissions";
import { cn } from "@/lib/utils";

// zone 模式（作为 ai-call 的 /knowledge zone 内嵌）时为 "/knowledge"，独立部署为空串。
// 构建期内联（见 next.config.mjs env）。
const WEB_BASE_PATH = process.env.NEXT_PUBLIC_WEB_BASE_PATH || "";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, accessToken, logout, setCookieSession } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (localStorage.getItem("sidebar-collapsed") === "1") {
      setCollapsed(true);
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  };

  // 未登录时的去向：zone 模式应去 ai-call 登录页（域名根 /login，带回跳）——本地
  // /knowledge/login 对联合身份用户无法登录（占位密码）；独立部署仍走本地登录页。
  const redirectToLogin = () => {
    if (WEB_BASE_PATH && typeof window !== "undefined") {
      const backTo = window.location.pathname + window.location.search;
      // window.location 不经过 basePath，"/login" 即域名根 = ai-call 登录页。
      window.location.href = `/login?redirect=${encodeURIComponent(backTo)}`;
      return;
    }
    router.push("/login");
  };

  // 登出：cookie 会话（无状态联合登录）的真正凭证是 ai-call 的 httpOnly cookie，JS
  // 清不掉，必须调 ai-call 的登出端点作废——否则回到任意页面都会被 /auth/me 引导重新
  // 拉起会话，登出形同虚设（原 #1）。"/api/auth/logout" 走域名根，zone 同域下即 ai-call API。
  const handleLogout = async () => {
    if (accessToken === COOKIE_SESSION) {
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      } catch {
        // 网络失败也继续清本地态；cookie 未清时下次进入会被重新引导为登录态。
      }
      logout();
      window.location.href = "/login";
      return;
    }
    logout();
    router.push("/login");
  };

  // 未登录时：先尝试用同域共享 cookie 引导会话（微前端无状态联合登录），失败才去登录页。
  // 独立部署无 cookie 时 /auth/me 返回 401 → 走登录页，与原行为一致。
  useEffect(() => {
    if (!mounted || accessToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get<{ user: any }>("/auth/me");
        const u = res?.user;
        if (!cancelled && u?.id) {
          setCookieSession({
            id: u.id,
            email: u.email ?? "",
            name: u.name ?? u.email ?? "",
            role: u.role ?? "",
            tenantId: u.tenantId ?? "",
          });
          return;
        }
        if (!cancelled) redirectToLogin();
      } catch {
        if (!cancelled) redirectToLogin();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, accessToken, router, setCookieSession]);

  // 支持 super_admin 和 admin
  const isAdmin = user?.role === Role.SUPER_ADMIN || user?.role === Role.ADMIN;

  const NAV = [
    { href: "/overview", label: "数据总览", icon: LayoutDashboard },
    { href: "/documents", label: "文档管理", icon: Files },
    { href: "/search", label: "智能检索", icon: Search },
    { href: "/qa", label: "AI 问答", icon: MessageSquare },
    { href: "/graph", label: "知识图谱", icon: Network },
    ...(isAdmin ? [{ href: "/settings", label: "系统设置", icon: Settings }] : []),
  ];

  // 客户端水合完成前显示空白，避免闪屏
  if (!mounted) return null;

  // 获取角色显示文本
  const getRoleLabel = (role?: string) => {
    if (role === Role.SUPER_ADMIN) return ROLE_LABELS[Role.SUPER_ADMIN];
    if (role === Role.ADMIN) return ROLE_LABELS[Role.ADMIN];
    if (role === Role.EDITOR) return ROLE_LABELS[Role.EDITOR];
    return ROLE_LABELS[Role.VIEWER];
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside
        className={cn(
          "relative shrink-0 bg-white border-r border-slate-200 flex flex-col transition-[width] duration-200",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "展开侧边栏" : "收起侧边栏"}
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
          className="absolute -right-3 top-20 z-10 h-6 w-6 rounded-full border border-slate-200 bg-white shadow-sm grid place-items-center text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition"
        >
          {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
        </button>

        <div
          className={cn(
            "h-16 flex items-center gap-2 border-b border-slate-200",
            collapsed ? "px-2 justify-center" : "px-5",
          )}
        >
          <div className="h-8 w-8 shrink-0 rounded-lg bg-brand-600 text-white grid place-items-center">
            <BookOpen size={16} />
          </div>
          {!collapsed && <span className="font-semibold truncate">AI 知识库</span>}
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                title={collapsed ? n.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg text-sm transition",
                  collapsed ? "justify-center px-0 py-2" : "px-3 py-2",
                  active
                    ? "bg-brand-50 text-brand-700 font-medium"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                <Icon size={16} className="shrink-0" />
                {!collapsed && n.label}
              </Link>
            );
          })}
        </nav>

        <div className={cn("p-3 border-t border-slate-200", collapsed && "px-2")}>
          {!collapsed ? (
            <>
              <div className="px-3 py-2 mb-2">
                <div className="text-sm font-medium truncate">{user?.name || "用户"}</div>
                <div className="text-xs text-slate-500 truncate">{user?.email}</div>
                <div className="text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                  {getRoleLabel(user?.role)}
                </div>
              </div>
              <button onClick={handleLogout} className="w-full btn-ghost justify-start">
                <LogOut size={14} /> 退出
              </button>
            </>
          ) : (
            <button
              onClick={handleLogout}
              title="退出登录"
              className="w-full flex justify-center py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
      {/* 全局 Toast 与确认弹窗宿主 */}
      <FeedbackHost />
    </div>
  );
}
