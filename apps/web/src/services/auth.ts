import { api } from "@/lib/api-client";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    tenantId: string;
    departmentId?: string;
  };
}

export async function login(data: LoginRequest) {
  const res = await api<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res;
}

const authApi = { login };

export default authApi;
