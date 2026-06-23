import useSWR, { SWRConfiguration } from "swr";
import { getUsers, createUser, updateUser, deleteUser, resetUserPassword } from "@/lib/api/endpoints/users";
import type { User, CreateUserData, UpdateUserData } from "@/types/api";

// 获取用户列表
export function useUsers(config?: SWRConfiguration<User[]>) {
  return useSWR<User[]>("/users", () => getUsers(), {
    revalidateOnFocus: false,
    ...config,
  });
}

// 导出操作函数
export const userActions = {
  create: createUser,
  update: updateUser,
  remove: deleteUser,
  resetPassword: resetUserPassword,
};
