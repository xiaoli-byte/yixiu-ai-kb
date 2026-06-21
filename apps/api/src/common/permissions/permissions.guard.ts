import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
  applyDecorators,
  UseGuards,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ClsService } from "nestjs-cls";
import {
  Role,
  Resource,
  Action,
  PERMISSION_MESSAGES,
  UserContext,
} from "./permissions.types";
import { PermissionsService } from "./permissions.service";

/** 权限检查元数据 key */
export const PERMISSIONS_KEY = "permissions";
export const ROLES_KEY = "roles";
export const MIN_ROLE_KEY = "min_role";

/**
 * 权限检查元数据
 */
export interface PermissionsMetadata {
  resource: Resource;
  action: Action;
  /** 是否检查资源所有者（默认 false） */
  checkOwner?: boolean;
  /** 所有者字段名（如 "ownerId"） */
  ownerField?: string;
}

/**
 * 权限装饰器 - 检查特定资源权限
 */
export const RequirePermissions = (...permissions: PermissionsMetadata[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * 角色装饰器 - 检查用户角色
 */
export const RequireRoles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * 最低角色装饰器 - 检查用户角色是否满足最低要求
 */
export const RequireMinRole = (role: Role) => SetMetadata(MIN_ROLE_KEY, role);

/**
 * 权限守卫
 * 支持：
 * - @RequireRoles - 检查用户角色
 * - @RequireMinRole - 检查最低角色
 * - @RequirePermissions - 检查资源权限
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
    private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. 检查角色要求
    const requiredRoles = this.reflector.get<Role[]>(ROLES_KEY, context.getHandler());
    if (requiredRoles?.length) {
      const userRole = this.getUserRole();
      if (!requiredRoles.includes(userRole)) {
        throw new ForbiddenException("您没有权限执行此操作");
      }
    }

    // 2. 检查最低角色要求
    const minRole = this.reflector.get<Role>(MIN_ROLE_KEY, context.getHandler());
    if (minRole) {
      const userRole = this.getUserRole();
      if (!this.permissionsService.hasMinimumRole(this.getUserContext(), minRole)) {
        const roleLabels: Record<Role, string> = {
          [Role.SUPER_ADMIN]: "超级管理员",
          [Role.ADMIN]: "管理员",
          [Role.EDITOR]: "编辑",
          [Role.VIEWER]: "查看者",
        };
        throw new ForbiddenException(`需要 ${roleLabels[minRole]} 权限`);
      }
    }

    // 3. 检查权限要求
    const requiredPermissions = this.reflector.get<PermissionsMetadata[]>(
      PERMISSIONS_KEY,
      context.getHandler(),
    );
    if (requiredPermissions?.length) {
      const userContext = this.getUserContext();
      const request = context.switchToHttp().getRequest();

      for (const perm of requiredPermissions) {
        const hasPermission = this.permissionsService.hasPermission(
          userContext,
          perm.resource,
          perm.action,
        );

        if (!hasPermission) {
          const message =
            PERMISSION_MESSAGES[userContext.role]?.[perm.action] ||
            PERMISSION_MESSAGES.default;
          throw new ForbiddenException(message);
        }

        // 可选：检查资源所有者
        if (perm.checkOwner && perm.ownerField) {
          const resourceOwnerId = request.body?.[perm.ownerField];
          if (resourceOwnerId && resourceOwnerId !== userContext.userId) {
            // 非所有者，检查是否有删除权限
            if (
              !this.permissionsService.hasPermission(
                userContext,
                perm.resource,
                Action.DELETE,
              )
            ) {
              throw new ForbiddenException("您没有权限操作此资源");
            }
          }
        }
      }
    }

    return true;
  }

  private getUserContext(): UserContext {
    return {
      userId: this.cls.get<string>("userId") || "",
      tenantId: this.cls.get<string>("tenantId") || "",
      role: (this.cls.get<string>("role") as Role) || Role.VIEWER,
      departmentId: this.cls.get<string>("departmentId"),
    };
  }

  private getUserRole(): Role {
    return (this.cls.get<string>("role") as Role) || Role.VIEWER;
  }
}

/**
 * 组合装饰器：权限 + JWT 认证 + 守卫
 */
export const Protected = (
  permissions?: PermissionsMetadata[],
  roles?: Role[],
  minRole?: Role,
) =>
  applyDecorators(
    UseGuards(PermissionsGuard),
    ...(permissions ? [RequirePermissions(...permissions)] : []),
    ...(roles ? [RequireRoles(...roles)] : []),
    ...(minRole ? [RequireMinRole(minRole)] : []),
  );

/**
 * 管理员专属装饰器（包含超级管理员）
 */
export const AdminOnly = () =>
  applyDecorators(RequireRoles(Role.ADMIN, Role.SUPER_ADMIN), UseGuards(PermissionsGuard));

/**
 * 编辑及以上权限装饰器（包含管理员和超级管理员）
 */
export const EditorOrAbove = () =>
  applyDecorators(RequireMinRole(Role.EDITOR), UseGuards(PermissionsGuard));

/**
 * 文档读权限装饰器
 */
export const CanReadDocuments = () =>
  RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.READ });

/**
 * 文档写权限装饰器
 */
export const CanWriteDocuments = () =>
  RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.CREATE });

/**
 * 文档管理权限装饰器
 */
export const CanManageDocuments = () =>
  RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.MANAGE });

/**
 * 用户管理权限装饰器
 */
export const CanManageUsers = () =>
  RequirePermissions({ resource: Resource.USERS, action: Action.MANAGE });
