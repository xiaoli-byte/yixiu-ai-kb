// 认证相关类型
export interface LoginRequest {
  email: string;
  password: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
  departmentId?: string;
}

export interface LoginResponse {
  user: User;
}

export interface RefreshTokenRequest {
  /** 浏览器使用 httpOnly cookie；仅保留给升级中的非浏览器客户端。 */
  refreshToken?: string;
}

export interface RefreshTokenResponse {
  user: User;
}
