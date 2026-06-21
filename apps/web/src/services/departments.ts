import { api } from "@/lib/api-client";

export interface Department {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
}

export interface CreateDepartmentData {
  name: string;
  parentId?: string | null;
}

export interface UpdateDepartmentData {
  name: string;
  parentId?: string | null;
}

export async function list() {
  const res = await api<Department[]>("/departments");
  return res;
}

export async function create(data: CreateDepartmentData) {
  const res = await api("/departments", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res;
}

export async function update(id: string, data: UpdateDepartmentData) {
  const res = await api(`/departments/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res;
}

export async function remove(id: string) {
  const res = await api(`/departments/${id}`, { method: "DELETE" });
  return res;
}

const departmentsApi = { list, create, update, remove };

export default departmentsApi;
