import { apiClient } from "../client";
import type {
  Department,
  CreateDepartmentData,
  UpdateDepartmentData,
} from "@/types/api";

// 获取部门列表
export async function getDepartments(): Promise<Department[]> {
  return apiClient.get<Department[]>("/departments");
}

// 创建部门
export async function createDepartment(
  data: CreateDepartmentData
): Promise<Department> {
  return apiClient.post<Department>("/departments", data);
}

// 更新部门
export async function updateDepartment(
  id: string,
  data: UpdateDepartmentData
): Promise<Department> {
  return apiClient.patch<Department>(`/departments/${id}`, data);
}

// 删除部门
export async function deleteDepartment(id: string): Promise<void> {
  return apiClient.delete(`/departments/${id}`);
}
