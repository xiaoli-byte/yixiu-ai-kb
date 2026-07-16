import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
  applyDecorators,
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
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

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
 * 权限守卫（app.module 以 APP_GUARD 全局注册，默认拒绝）
 * 支持：
 * - @Public - 公开路由，跳过全部检查
 * - @RequireRoles - 检查用户角色
 * - @RequireMinRole - 检查最低角色（"只需登录"用 @AnyAuthenticated）
 * - @RequirePermissions - 检查资源权限
 *
 * 关键不变量：非 @Public 路由必须声明上述权限元数据之一，否则一律 403。
 * 旧版是"无声明即放行"，漏挂装饰器的写端点会静默暴露给任意登录角色——
 * 多轮审查反复挖出的越权洞全部源于此。反转后"漏挂"表现为 403 显式故障，
 * 配合 authz-route-coverage.spec.ts 在 CI 阶段就拦下。
 * 元数据用 getAllAndOverride 读取：方法级覆盖类级，类级声明对全 controller 生效
 * （旧版只读方法级，类级 @AdminOnly 会被静默忽略）。
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
    private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 0. 公开路由直接放行（登录/健康检查/服务间端点）
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const targets = [context.getHandler(), context.getClass()] as const;
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [...targets]);
    const minRole = this.reflector.getAllAndOverride<Role>(MIN_ROLE_KEY, [...targets]);
    const requiredPermissions = this.reflector.getAllAndOverride<PermissionsMetadata[]>(
      PERMISSIONS_KEY,
      [...targets],
    );

    // 默认拒绝：没有任何权限声明的路由不可达
    if (!requiredRoles?.length && !minRole && !requiredPermissions?.length) {
      throw new ForbiddenException(
        "该路由未声明访问权限（默认拒绝）。请为其添加 @Public / @AnyAuthenticated / 权限装饰器之一",
      );
    }

    // 1. 检查角色要求
    if (requiredRoles?.length) {
      const userRole = this.getUserRole();
      if (!requiredRoles.includes(userRole)) {
        throw new ForbiddenException("您没有权限执行此操作");
      }
    }

    // 2. 检查最低角色要求
    if (minRole) {
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
 * 组合装饰器：声明多类权限元数据
 * （JwtAuthGuard/PermissionsGuard 已全局注册，装饰器只负责声明元数据）
 */
export const Protected = (
  permissions?: PermissionsMetadata[],
  roles?: Role[],
  minRole?: Role,
) =>
  applyDecorators(
    ...(permissions ? [RequirePermissions(...permissions)] : []),
    ...(roles ? [RequireRoles(...roles)] : []),
    ...(minRole ? [RequireMinRole(minRole)] : []),
  );

/**
 * 管理员专属装饰器（包含超级管理员）
 */
export const AdminOnly = () => RequireRoles(Role.ADMIN, Role.SUPER_ADMIN);

/**
 * 编辑及以上权限装饰器（包含管理员和超级管理员）
 */
export const EditorOrAbove = () => RequireMinRole(Role.EDITOR);

/**
 * 仅要求登录（任意有效角色）。
 * 默认拒绝策略下，"只需登录"也必须显式声明，不存在"什么都不写=登录即可"。
 */
export const AnyAuthenticated = () => RequireMinRole(Role.VIEWER);

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
