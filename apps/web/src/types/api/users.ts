// 用户相关类型
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

export interface ResetPasswordData {
  newPassword: string;
}
