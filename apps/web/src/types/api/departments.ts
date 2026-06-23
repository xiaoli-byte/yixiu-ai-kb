// 部门相关类型
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
