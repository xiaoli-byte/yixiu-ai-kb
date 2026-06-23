"use client";

import { useEffect, useState } from "react";
import { login as loginApi, logout as logoutApi } from "@/lib/api/endpoints/auth";
import { clearAuth } from "@/lib/api/client";
import type { LoginRequest, LoginResponse } from "@/types/api";

// 获取存储的用户信息
function getStoredUser(): LoginResponse["user"] | null {
  if (typeof window === "undefined") return null;
  const userStr = localStorage.getItem("user");
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

// 设置用户信息
function setStoredUser(user: LoginResponse["user"]) {
  if (typeof window === "undefined") return;
  localStorage.setItem("user", JSON.stringify(user));
}

// 清除用户信息
function clearStoredUser() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("user");
}

// Auth Hook
export function useAuth() {
  const [user, setUser] = useState<LoginResponse["user"] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = getStoredUser();
    setUser(storedUser);
    setIsLoading(false);
  }, []);

  const login = async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await loginApi(data);
    setStoredUser(response.user);
    setUser(response.user);
    return response;
  };

  const logout = async () => {
    try {
      await logoutApi();
    } finally {
      clearAuth();
      clearStoredUser();
      setUser(null);
    }
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  };
}
