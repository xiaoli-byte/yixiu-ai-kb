"use client";
import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";
import { Role, Resource, Action, Permission, ROLE_PERMISSIONS, ROLE_HIERARCHY } from "@/types/permissions";
import { useAuth } from "@/lib/store";

interface UserPermissions {
  role: Role;
  permissions: Permission[];
}

interface PermissionsContextType {
  /** 当前用户角色 */
  role: Role;
  /** 当前用户权限 */
  permissions: Permission[];
  /** 是否有指定权限 */
  hasPermission: (resource: Resource, action: Action) => boolean;
  /** 是否有任意一个权限 */
  hasAnyPermission: (requirements: Array<{ resource: Resource; action: Action }>) => boolean;
  /** 是否有所有权限 */
  hasAllPermissions: (requirements: Array<{ resource: Resource; action: Action }>) => boolean;
  /** 是否有最低角色权限 */
  hasMinimumRole: (minRole: Role) => boolean;
  /** 是否为管理员 */
  isAdmin: boolean;
  /** 是否为编辑或更高 */
  isEditor: boolean;
  /** 设置用户权限 */
  setUserPermissions: (permissions: UserPermissions) => void;
  /** 清除用户权限 */
  clearPermissions: () => void;
}

const PermissionsContext = createContext<PermissionsContextType | null>(null);

/** 权限提供者 */
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [role, setRole] = useState<Role>(Role.VIEWER);
  const [permissions, setPermissions] = useState<Permission[]>([]);

  // 从 auth store 同步用户角色
  useEffect(() => {
    if (user?.role) {
      const userRole = user.role as Role;
      setRole(userRole);
      // 同步权限列表
      setPermissions(ROLE_PERMISSIONS[userRole] || []);
    }
  }, [user?.role]);

  /**
   * 检查是否具有指定权限
   */
  const hasPermission = useCallback(
    (resource: Resource, action: Action): boolean => {
      const permission = permissions.find((p) => p.resource === resource);
      if (!permission) return false;
      return (
        permission.actions.includes(action) ||
        permission.actions.includes(Action.MANAGE)
      );
    },
    [permissions],
  );

  /**
   * 检查是否具有任意一个权限
   */
  const hasAnyPermission = useCallback(
    (requirements: Array<{ resource: Resource; action: Action }>): boolean => {
      return requirements.some(({ resource, action }) =>
        hasPermission(resource, action),
      );
    },
    [hasPermission],
  );

  /**
   * 检查是否具有所有权限
   */
  const hasAllPermissions = useCallback(
    (requirements: Array<{ resource: Resource; action: Action }>): boolean => {
      return requirements.every(({ resource, action }) =>
        hasPermission(resource, action),
      );
    },
    [hasPermission],
  );

  /**
   * 检查是否有最低角色权限
   */
  const hasMinimumRole = useCallback(
    (minRole: Role): boolean => {
      return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minRole];
    },
    [role],
  );

  /** 是否为管理员（包括 super_admin） */
  const isAdmin = role === Role.ADMIN || role === Role.SUPER_ADMIN;

  /** 是否为编辑或更高（包括 admin 和 super_admin） */
  const isEditor = hasMinimumRole(Role.EDITOR);

  /**
   * 设置用户权限
   */
  const setUserPermissions = useCallback((userPerms: UserPermissions) => {
    setRole(userPerms.role);
    setPermissions(userPerms.permissions);
  }, []);

  /**
   * 清除用户权限
   */
  const clearPermissions = useCallback(() => {
    setRole(Role.VIEWER);
    setPermissions([]);
  }, []);

  return (
    <PermissionsContext.Provider
      value={{
        role,
        permissions,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        hasMinimumRole,
        isAdmin,
        isEditor,
        setUserPermissions,
        clearPermissions,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

/** 使用权限上下文 */
export function usePermissions() {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error("usePermissions must be used within a PermissionsProvider");
  }
  return context;
}

/**
 * Hook: 检查是否有指定权限
 */
export function usePermission(resource: Resource, action: Action): boolean {
  const { hasPermission } = usePermissions();
  return hasPermission(resource, action);
}

/**
 * Hook: 检查是否有最低角色权限
 */
export function useMinRole(minRole: Role): boolean {
  const { hasMinimumRole } = usePermissions();
  return hasMinimumRole(minRole);
}

/**
 * Hook: 是否为管理员
 */
export function useIsAdmin(): boolean {
  const { isAdmin } = usePermissions();
  return isAdmin;
}

/**
 * Hook: 是否为编辑或更高
 */
export function useIsEditor(): boolean {
  const { isEditor } = usePermissions();
  return isEditor;
}
