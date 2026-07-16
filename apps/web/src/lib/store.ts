import { create } from "zustand";

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
}

// 无状态联合登录（微前端同域内嵌）：ai-call 的 httpOnly cookie 已认证，但 JS 读不到它。
// 用这个内存哨兵作为 accessToken 令路由守卫通过；不写 localStorage（避免污染独立部署的
// Bearer 流），API 调用靠 fetch 的 credentials:"include" 带 cookie 认证。
export const COOKIE_SESSION = "__cookie_session__";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  setUser: (u: User) => void;
  setCookieSession: (u: User) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => {
  return {
    accessToken: null,
    refreshToken: null,
    user: null,
    setUser: (user) => {
      set({ user });
    },
    setCookieSession: (user) => {
      // 仅内存：不写 localStorage，刷新后由布局守卫重新 /auth/me 引导。
      set({ accessToken: COOKIE_SESSION, refreshToken: null, user });
    },
    logout: () => {
      // 清除升级前遗留的 Bearer token；新会话的凭证只在 httpOnly cookie 中。
      if (typeof window !== "undefined") {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("authUser");
      }
      set({ accessToken: null, refreshToken: null, user: null });
    },
  };
});
