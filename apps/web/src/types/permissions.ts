/**
 * 权限系统 - 前端类型定义
 */

export enum Role {
  SUPER_ADMIN = "super_admin",
  ADMIN = "admin",
  EDITOR = "editor",
  VIEWER = "viewer",
}

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

export enum Action {
  CREATE = "create",
  READ = "read",
  UPDATE = "update",
  DELETE = "delete",
  MANAGE = "manage",
}

export interface Permission {
  resource: Resource;
  actions: Action[];
}

export interface UserPermissions {
  role: Role;
  permissions: Permission[];
}

/** 角色权限映射 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: [
    { resource: Resource.DOCUMENTS, actions: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE, Action.MANAGE] },
    { resource: Resource.FOLDERS, actions: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE, Action.MANAGE] },
    { resource: Resource.TAGS, actions: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE, Action.MANAGE] },
    { resource: Resource.USERS, actions: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE, Action.MANAGE] },
    { resource: Resource.DEPARTMENTS, actions: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE, Action.MANAGE] },
    { resource: Resource.CONVERSATIONS, actions: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE, Action.MANAGE] },
    { resource: Resource.GRAPH, actions: [Action.READ, Action.MANAGE] },
    { resource: Resource.SETTINGS, actions: [Action.MANAGE] },
  ],
  [Role.ADMIN]: [
    { resource: Resource.DOCUMENTS, actions: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE, Action.MANAGE] },
    { resource: Resource.FOLDERS, actions: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE, Action.MANAGE] },
    { resource: Resource.TAGS, actions: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE, Action.MANAGE] },
    { resource: Resource.USERS, actions: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE, Action.MANAGE] },
    { resource: Resource.DEPARTMENTS, actions: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE, Action.MANAGE] },
    { resource: Resource.CONVERSATIONS, actions: [Action.READ] },
    { resource: Resource.GRAPH, actions: [Action.READ] },
    { resource: Resource.SETTINGS, actions: [Action.MANAGE] },
  ],
  [Role.EDITOR]: [
    { resource: Resource.DOCUMENTS, actions: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE] },
    { resource: Resource.FOLDERS, actions: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE] },
    { resource: Resource.TAGS, actions: [Action.READ, Action.UPDATE] },
    { resource: Resource.CONVERSATIONS, actions: [Action.CREATE, Action.READ, Action.UPDATE, Action.DELETE] },
    { resource: Resource.GRAPH, actions: [Action.READ] },
  ],
  [Role.VIEWER]: [
    { resource: Resource.DOCUMENTS, actions: [Action.READ] },
    { resource: Resource.FOLDERS, actions: [Action.READ] },
    { resource: Resource.TAGS, actions: [Action.READ] },
    { resource: Resource.CONVERSATIONS, actions: [Action.CREATE, Action.READ] },
    { resource: Resource.GRAPH, actions: [Action.READ] },
  ],
};

/** 角色层级 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.SUPER_ADMIN]: 4,
  [Role.ADMIN]: 3,
  [Role.EDITOR]: 2,
  [Role.VIEWER]: 1,
};

/** 角色标签映射 */
export const ROLE_LABELS: Record<Role, string> = {
  [Role.SUPER_ADMIN]: "超级管理员",
  [Role.ADMIN]: "管理员",
  [Role.EDITOR]: "企业员工",
  [Role.VIEWER]: "查看者",
};

/** 资源标签映射 */
export const RESOURCE_LABELS: Record<Resource, string> = {
  [Resource.DOCUMENTS]: "文档",
  [Resource.FOLDERS]: "文件夹",
  [Resource.TAGS]: "标签",
  [Resource.USERS]: "用户",
  [Resource.DEPARTMENTS]: "部门",
  [Resource.CONVERSATIONS]: "对话",
  [Resource.GRAPH]: "知识图谱",
  [Resource.SETTINGS]: "系统设置",
};

/** 操作标签映射 */
export const ACTION_LABELS: Record<Action, string> = {
  [Action.CREATE]: "创建",
  [Action.READ]: "查看",
  [Action.UPDATE]: "修改",
  [Action.DELETE]: "删除",
  [Action.MANAGE]: "管理",
};
