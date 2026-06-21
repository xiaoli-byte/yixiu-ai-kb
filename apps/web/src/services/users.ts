import { api } from "@/lib/api-client";

export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "editor" | "viewer";
  departmentId?: string;
  createdAt: string;
}

export interface CreateUserData {
  email: string;
  name: string;
  password: string;
  role: string;
  departmentId?: string | null;
}

export interface UpdateUserData {
  name: string;
  role: string;
  departmentId?: string | null;
}

export async function list() {
  const res = await api<User[]>("/users");
  return res;
}

export async function create(data: CreateUserData) {
  const res = await api("/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res;
}

export async function update(id: string, data: UpdateUserData) {
  const res = await api(`/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res;
}

export async function remove(id: string) {
  const res = await api(`/users/${id}`, { method: "DELETE" });
  return res;
}

export async function resetPassword(id: string, newPassword: string) {
  const res = await api(`/users/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ newPassword }),
  });
  return res;
}

const usersApi = { list, create, update, remove, resetPassword };

export default usersApi;
