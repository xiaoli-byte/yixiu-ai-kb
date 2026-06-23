import { apiClient } from "../client";
import type {
  User,
  CreateUserData,
  UpdateUserData,
} from "@/types/api";

// 获取用户列表
export async function getUsers(): Promise<User[]> {
  return apiClient.get<User[]>("/users");
}

// 创建用户
export async function createUser(data: CreateUserData): Promise<User> {
  return apiClient.post<User>("/users", data);
}

// 更新用户
export async function updateUser(
  id: string,
  data: UpdateUserData
): Promise<User> {
  return apiClient.patch<User>(`/users/${id}`, data);
}

// 删除用户
export async function deleteUser(id: string): Promise<void> {
  return apiClient.delete(`/users/${id}`);
}

// 重置密码
export async function resetUserPassword(
  id: string,
  newPassword: string
): Promise<void> {
  return apiClient.post(`/users/${id}/reset-password`, { newPassword });
}
