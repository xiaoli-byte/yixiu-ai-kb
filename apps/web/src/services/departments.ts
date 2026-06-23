import {
  getDepartments as getDeptsApi,
  createDepartment as createDeptApi,
  updateDepartment as updateDeptApi,
  deleteDepartment as deleteDeptApi,
} from "@/lib/api/endpoints/departments";

// 类型
export type { Department, CreateDepartmentData, UpdateDepartmentData } from "@/types/api";

// 导出 API 函数
export const list = getDeptsApi;
export const create = createDeptApi;
export const update = updateDeptApi;
export const remove = deleteDeptApi;

// 默认导出
const departmentsApi = { list, create, update, remove };
export default departmentsApi;
