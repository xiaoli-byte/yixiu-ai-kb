import { Injectable } from "@nestjs/common";
import {
  Role,
  Resource,
  Action,
  ROLE_PERMISSIONS,
  ROLE_HIERARCHY,
  UserContext,
  Permission,
} from "./permissions.types";

@Injectable()
export class PermissionsService {
  /**
   * 检查用户是否具有指定权限
   */
  hasPermission(user: UserContext, resource: Resource, action: Action): boolean {
    const role = user.role as Role;
    const permissions = ROLE_PERMISSIONS[role];

    if (!permissions) return false;

    const permission = permissions.find((p) => p.resource === resource);
    if (!permission) return false;

    // 检查是否包含指定操作
    return (
      permission.actions.includes(action) ||
      permission.actions.includes(Action.MANAGE)
    );
  }

  /**
   * 检查用户是否具有至少一个指定权限
   */
  hasAnyPermission(
    user: UserContext,
    requirements: Array<{ resource: Resource; action: Action }>,
  ): boolean {
    return requirements.some(({ resource, action }) =>
      this.hasPermission(user, resource, action),
    );
  }

  /**
   * 检查用户是否具有所有指定权限
   */
  hasAllPermissions(
    user: UserContext,
    requirements: Array<{ resource: Resource; action: Action }>,
  ): boolean {
    return requirements.every(({ resource, action }) =>
      this.hasPermission(user, resource, action),
    );
  }

  /**
   * 检查用户角色是否满足最低角色要求
   */
  hasMinimumRole(user: UserContext, minRole: Role): boolean {
    return ROLE_HIERARCHY[user.role as Role] >= ROLE_HIERARCHY[minRole];
  }

  /**
   * 检查用户是否为管理员或超级管理员
   */
  isAdmin(user: UserContext): boolean {
    return user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN;
  }

  /**
   * 检查用户是否为编辑或更高角色
   */
  isEditor(user: UserContext): boolean {
    return this.hasMinimumRole(user, Role.EDITOR);
  }

  /**
   * 获取用户的所有权限
   */
  getUserPermissions(user: UserContext): Permission[] {
    return ROLE_PERMISSIONS[user.role as Role] || [];
  }

  /**
   * 检查用户是否可以访问指定资源
   */
  canAccess(user: UserContext, resource: Resource): boolean {
    return this.hasPermission(user, resource, Action.READ);
  }

  /**
   * 检查用户是否可以修改指定资源
   */
  canModify(user: UserContext, resource: Resource): boolean {
    return (
      this.hasPermission(user, resource, Action.UPDATE) ||
      this.hasPermission(user, resource, Action.DELETE)
    );
  }

  /**
   * 检查用户是否可以管理指定资源
   */
  canManage(user: UserContext, resource: Resource): boolean {
    return this.hasPermission(user, resource, Action.MANAGE);
  }

  /**
   * 检查用户是否可以执行创建操作
   */
  canCreate(user: UserContext, resource: Resource): boolean {
    return this.hasPermission(user, resource, Action.CREATE);
  }

  /**
   * 检查用户是否可以删除资源
   */
  canDelete(user: UserContext, resource: Resource): boolean {
    return this.hasPermission(user, resource, Action.DELETE);
  }

  /**
   * 获取角色列表（用于前端下拉）
   */
  getRoleOptions(): Array<{ value: Role; label: string; level: number }> {
    return [
      { value: Role.SUPER_ADMIN, label: "超级管理员", level: ROLE_HIERARCHY[Role.SUPER_ADMIN] },
      { value: Role.ADMIN, label: "管理员", level: ROLE_HIERARCHY[Role.ADMIN] },
      { value: Role.EDITOR, label: "编辑", level: ROLE_HIERARCHY[Role.EDITOR] },
      { value: Role.VIEWER, label: "查看者", level: ROLE_HIERARCHY[Role.VIEWER] },
    ];
  }

  /**
   * 获取资源列表（用于权限配置）
   */
  getResourceOptions(): Array<{ value: Resource; label: string }> {
    return [
      { value: Resource.DOCUMENTS, label: "文档" },
      { value: Resource.FOLDERS, label: "文件夹" },
      { value: Resource.TAGS, label: "标签" },
      { value: Resource.USERS, label: "用户" },
      { value: Resource.DEPARTMENTS, label: "部门" },
      { value: Resource.CONVERSATIONS, label: "对话" },
      { value: Resource.GRAPH, label: "知识图谱" },
      { value: Resource.SETTINGS, label: "系统设置" },
    ];
  }

  /**
   * 获取操作列表（用于权限配置）
   */
  getActionOptions(): Array<{ value: Action; label: string }> {
    return [
      { value: Action.CREATE, label: "创建" },
      { value: Action.READ, label: "查看" },
      { value: Action.UPDATE, label: "修改" },
      { value: Action.DELETE, label: "删除" },
      { value: Action.MANAGE, label: "管理（全部）" },
    ];
  }
}
