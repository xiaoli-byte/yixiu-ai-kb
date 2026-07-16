/**
 * 权限系统 - 类型定义和枚举
 */
import { ROLE_RANK } from "@xiaoli-byte/authz";

/** 角色类型 */
export enum Role {
  SUPER_ADMIN = "super_admin",
  ADMIN = "admin",
  EDITOR = "editor",
  VIEWER = "viewer",
}

/** 资源类型 */
export enum Resource {
  DOCUMENTS = "documents",
  FOLDERS = "folders",
  TAGS = "tags",
  USERS = "users",
  DEPARTMENTS = "departments",
  CONVERSATIONS = "conversations",
  GRAPH = "graph",
  SETTINGS = "settings",
}

/** 操作类型 */
export enum Action {
  CREATE = "create",
  READ = "read",
  UPDATE = "update",
  DELETE = "delete",
  MANAGE = "manage", // 包含 create, read, update, delete
}

/** 权限定义 */
export interface Permission {
  resource: Resource;
  actions: Action[];
}

/** 角色权限映射 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: [
    { resource: Resource.DOCUMENTS, actions: [Action.MANAGE] },
    { resource: Resource.FOLDERS, actions: [Action.MANAGE] },
    { resource: Resource.TAGS, actions: [Action.MANAGE] },
    { resource: Resource.USERS, actions: [Action.MANAGE] },
    { resource: Resource.DEPARTMENTS, actions: [Action.MANAGE] },
    { resource: Resource.CONVERSATIONS, actions: [Action.MANAGE] },
    { resource: Resource.GRAPH, actions: [Action.MANAGE] },
    { resource: Resource.SETTINGS, actions: [Action.MANAGE] },
  ],
  [Role.ADMIN]: [
    { resource: Resource.DOCUMENTS, actions: [Action.MANAGE] },
    { resource: Resource.FOLDERS, actions: [Action.MANAGE] },
    { resource: Resource.TAGS, actions: [Action.MANAGE] },
    { resource: Resource.USERS, actions: [Action.MANAGE] },
    { resource: Resource.DEPARTMENTS, actions: [Action.MANAGE] },
    { resource: Resource.CONVERSATIONS, actions: [Action.READ] },
    { resource: Resource.GRAPH, actions: [Action.MANAGE] },
    { resource: Resource.SETTINGS, actions: [Action.MANAGE] },
  ],
  [Role.EDITOR]: [
    { resource: Resource.DOCUMENTS, actions: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE] },
    { resource: Resource.FOLDERS, actions: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE] },
    { resource: Resource.TAGS, actions: [Action.READ, Action.UPDATE] },
    { resource: Resource.CONVERSATIONS, actions: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE] },
    { resource: Resource.GRAPH, actions: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE] },
  ],
  [Role.VIEWER]: [
    { resource: Resource.DOCUMENTS, actions: [Action.READ] },
    { resource: Resource.FOLDERS, actions: [Action.READ] },
    { resource: Resource.TAGS, actions: [Action.READ] },
    { resource: Resource.CONVERSATIONS, actions: [Action.CREATE, Action.READ] },
    { resource: Resource.GRAPH, actions: [Action.READ] },
  ],
};

/** 角色层级（用于权限继承判断）。数值唯一定义在 @xiaoli-byte/authz/core 的 ROLE_RANK，此处仅按本地枚举取值。 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.SUPER_ADMIN]: ROLE_RANK.super_admin,
  [Role.ADMIN]: ROLE_RANK.admin,
  [Role.EDITOR]: ROLE_RANK.editor,
  [Role.VIEWER]: ROLE_RANK.viewer,
};

/** 用户上下文信息 */
export interface UserContext {
  userId: string;
  tenantId: string;
  role: Role;
  departmentId?: string;
}

/** 权限检查选项 */
export interface PermissionCheckOptions {
  resource: Resource;
  action: Action;
  ownerId?: string; // 用于检查资源所有者
  ownerField?: string; // 请求中包含所有者信息的字段名
}

/** 权限错误信息 */
export const PERMISSION_MESSAGES = {
  [Role.SUPER_ADMIN]: {
    [Action.READ]: "需要超级管理员权限",
    [Action.CREATE]: "需要超级管理员权限",
    [Action.UPDATE]: "需要超级管理员权限",
    [Action.DELETE]: "需要超级管理员权限",
    [Action.MANAGE]: "需要超级管理员权限",
  },
  [Role.ADMIN]: {
    [Action.READ]: "需要管理员权限查看",
    [Action.CREATE]: "需要管理员权限创建",
    [Action.UPDATE]: "需要管理员权限修改",
    [Action.DELETE]: "需要管理员权限删除",
    [Action.MANAGE]: "需要管理员权限",
  },
  [Role.EDITOR]: {
    [Action.READ]: "需要编辑权限查看",
    [Action.CREATE]: "需要编辑权限创建",
    [Action.UPDATE]: "需要编辑权限修改",
    [Action.DELETE]: "需要编辑权限删除",
    [Action.MANAGE]: "需要编辑权限",
  },
  [Role.VIEWER]: {
    [Action.READ]: "需要查看权限",
    [Action.CREATE]: "只有编辑及以上权限才能创建",
    [Action.UPDATE]: "只有编辑及以上权限才能修改",
    [Action.DELETE]: "只有编辑及以上权限才能删除",
    [Action.MANAGE]: "只有管理员才能执行此操作",
  },
  default: "您没有权限执行此操作",
};
