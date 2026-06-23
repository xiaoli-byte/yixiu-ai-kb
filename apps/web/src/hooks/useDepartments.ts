import useSWR, { SWRConfiguration } from "swr";
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from "@/lib/api/endpoints/departments";
import type { Department, CreateDepartmentData, UpdateDepartmentData } from "@/types/api";

// 获取部门列表
export function useDepartments(config?: SWRConfiguration<Department[]>) {
  return useSWR<Department[]>("/departments", () => getDepartments(), {
    revalidateOnFocus: false,
    ...config,
  });
}

// 导出操作函数
export const departmentActions = {
  create: createDepartment,
  update: updateDepartment,
  remove: deleteDepartment,
};
