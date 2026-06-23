import {
  getUsers as getUsersApi,
  createUser as createUserApi,
  updateUser as updateUserApi,
  deleteUser as deleteUserApi,
  resetUserPassword as resetPwdApi,
} from "@/lib/api/endpoints/users";

// 类型
export type { User, CreateUserData, UpdateUserData } from "@/types/api";

// 导出 API 函数
export const list = getUsersApi;
export const create = createUserApi;
export const update = updateUserApi;
export const remove = deleteUserApi;
export const resetPassword = resetPwdApi;

// 默认导出
const usersApi = { list, create, update, remove, resetPassword };
export default usersApi;
