"use client";
import { ReactNode } from "react";
import { Role, Resource, Action } from "@/types/permissions";
import { usePermissions } from "@/contexts/permissions-context";

interface PermissionGateProps {
  /** 需要检查的权限 */
  permission?: { resource: Resource; action: Action };
  /** 需要检查的权限列表（任意一个满足即可） */
  anyPermission?: Array<{ resource: Resource; action: Action }>;
  /** 需要检查的权限列表（全部满足） */
  allPermissions?: Array<{ resource: Resource; action: Action }>;
  /** 需要检查的最低角色 */
  minRole?: Role;
  /** 权限不足时显示的回退内容 */
  fallback?: ReactNode;
  /** 子元素 */
  children: ReactNode;
  /** 是否在权限不足时隐藏（而非显示 fallback） */
  hidden?: boolean;
}

/**
 * 权限门控组件
 * 根据用户权限决定是否显示子元素
 */
export function PermissionGate({
  permission,
  anyPermission,
  allPermissions,
  minRole,
  fallback = null,
  children,
  hidden = false,
}: PermissionGateProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, hasMinimumRole } = usePermissions();

  // 检查各项条件
  const permissionOk = permission
    ? hasPermission(permission.resource, permission.action)
    : true;
  const anyOk = anyPermission ? hasAnyPermission(anyPermission) : true;
  const allOk = allPermissions ? hasAllPermissions(allPermissions) : true;
  const roleOk = minRole ? hasMinimumRole(minRole) : true;

  const allowed = permissionOk && anyOk && allOk && roleOk;

  if (allowed) {
    return <>{children}</>;
  }

  // hidden 模式下完全隐藏
  if (hidden) {
    return null;
  }

  // 否则显示 fallback
  return <>{fallback}</>;
}

/**
 * 管理员专属组件
 */
export function AdminOnly({
  children,
  fallback = null,
  hidden = false,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  hidden?: boolean;
}) {
  return (
    <PermissionGate minRole={Role.ADMIN} fallback={fallback} hidden={hidden}>
      {children}
    </PermissionGate>
  );
}

/**
 * 编辑或更高权限组件
 */
export function EditorOrAbove({
  children,
  fallback = null,
  hidden = false,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  hidden?: boolean;
}) {
  return (
    <PermissionGate minRole={Role.EDITOR} fallback={fallback} hidden={hidden}>
      {children}
    </PermissionGate>
  );
}

/**
 * 文档权限组件
 */
export function DocumentPermission({
  action,
  children,
  fallback = null,
  hidden = false,
}: {
  action: Action;
  children: ReactNode;
  fallback?: ReactNode;
  hidden?: boolean;
}) {
  return (
    <PermissionGate
      permission={{ resource: Resource.DOCUMENTS, action }}
      fallback={fallback}
      hidden={hidden}
    >
      {children}
    </PermissionGate>
  );
}

/**
 * 条件渲染组件 - 仅当有权限时渲染
 */
export function WhenAllowed({
  condition,
  children,
  fallback = null,
}: {
  condition: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return condition ? <>{children}</> : <>{fallback}</>;
}
