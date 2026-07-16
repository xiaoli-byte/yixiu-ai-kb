import { Controller, Get, Patch, Param, Body } from "@nestjs/common";
import { CurrentUser } from "../decorators/current-user.decorator";
import { AdminOnly, AnyAuthenticated } from "./permissions.guard";
import { RolesManagementService } from "./roles-management.service";
import { PermissionsService } from "./permissions.service";
import { Role, Resource, Action } from "./permissions.types";

/**
 * 权限管理控制器
 * 提供权限查询和角色管理接口
 */
@Controller("permissions")
export class PermissionsController {
  constructor(
    private readonly rolesService: RolesManagementService,
    private readonly permissionsService: PermissionsService,
  ) {}

  /**
   * 获取当前用户的权限信息
   */
  @Get("me")
  @AnyAuthenticated()
  async getMyPermissions(
    @CurrentUser("sub") userId: string,
    @CurrentUser("tenantId") tenantId: string,
  ) {
    return this.rolesService.getUserPermissions(userId, tenantId);
  }

  /**
   * 获取角色统计
   */
  @Get("stats")
  @AnyAuthenticated()
  async getRoleStats(@CurrentUser("tenantId") tenantId: string) {
    return this.rolesService.getRoleStatistics(tenantId);
  }

  /**
   * 获取用户列表及角色
   * 用户目录属管理员能力（与 users.controller 的 AdminOnly 口径对齐）；前端当前无调用，收紧零影响。
   */
  @Get("users")
  @AdminOnly()
  async getUsersWithRoles(
    @CurrentUser("sub") userId: string,
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("role") role: string,
  ) {
    return this.rolesService.getTenantUsersWithRoles({
      userId,
      tenantId,
      role: role as Role,
    });
  }

  /**
   * 修改用户角色（管理员）
   * @AdminOnly 是第一道门；服务层还有 isAdmin / 禁改自己 / 同租户 / 角色层级校验兜底。
   */
  @Patch("users/:userId/role")
  @AdminOnly()
  async updateUserRole(
    @CurrentUser("sub") operatorId: string,
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("role") operatorRole: string,
    @Param("userId") targetUserId: string,
    @Body() body: { role: Role },
  ) {
    await this.rolesService.updateUserRole(
      { userId: operatorId, tenantId, role: operatorRole as Role },
      targetUserId,
      body?.role,
    );
    return { success: true };
  }

  /**
   * 获取可用的角色选项
   */
  @Get("options")
  @AnyAuthenticated()
  async getOptions() {
    return {
      roles: this.permissionsService.getRoleOptions(),
      resources: this.permissionsService.getResourceOptions(),
      actions: this.permissionsService.getActionOptions(),
    };
  }
}
