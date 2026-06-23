import { login as loginApi, logout as logoutApi, refreshToken as refreshTokenApi } from "@/lib/api/endpoints/auth";
import { saveAuth, clearAuth } from "@/lib/api/client";

// 类型
export type { LoginRequest, LoginResponse, User } from "@/types/api";

// 导出 API 函数
export const login = loginApi;
export const logout = logoutApi;
export const refreshToken = refreshTokenApi;
export { saveAuth, clearAuth };

// 默认导出
const authApi = { login, logout, refreshToken };
export default authApi;
