import { apiClient } from "../client";
import { saveAuth, clearAuth } from "../client";
import type { LoginRequest, LoginResponse } from "@/types/api";

// 登录
export async function login(data: LoginRequest): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>("/auth/login", data);
  saveAuth(response.accessToken, response.refreshToken);
  return response;
}

// 登出
export async function logout(): Promise<void> {
  try {
    await apiClient.post("/auth/logout");
  } finally {
    clearAuth();
  }
}

// 刷新 Token
export async function refreshToken(
  refreshTokenValue: string
): Promise<{ accessToken: string }> {
  return apiClient.post("/auth/refresh", { refreshToken: refreshTokenValue });
}
