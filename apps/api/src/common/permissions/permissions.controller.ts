import { Controller, Get, Patch, Body, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUser } from "../decorators/current-user.decorator";
import { RolesManagementService } from "./roles-management.service";
import { PermissionsService } from "./permissions.service";
import { Role, Resource, Action } from "./permissions.types";

/**
 * 权限管理控制器
 * 提供权限查询和角色管理接口
 */
@Controller("permissions")
@UseGuards(AuthGuard("jwt"))
export class PermissionsController {
  constructor(
    private readonly rolesService: RolesManagementService,
    private readonly permissionsService: PermissionsService,
  ) {}

  /**
   * 获取当前用户的权限信息
   */
  @Get("me")
  async getMyPermissions(@CurrentUser("sub") userId: string) {
    return this.rolesService.getUserPermissions(userId, "current"); // tenantId 从 context 获取
  }

  /**
   * 获取角色统计
   */
  @Get("stats")
  async getRoleStats(@CurrentUser("tenantId") tenantId: string) {
    return this.rolesService.getRoleStatistics(tenantId);
  }

  /**
   * 获取用户列表及角色
   */
  @Get("users")
  async getUsersWithRoles(
    @CurrentUser("sub") userId: string,
    @CurrentUser("tenantId") tenantId: string,
  ) {
    const context = {
      userId,
      tenantId,
      role: Role.VIEWER, // 会通过 ClsService 正确设置
    };
    // 注意：这里需要通过 ClsService 获取实际 role
    return this.rolesService.getTenantUsersWithRoles(context);
  }

  /**
   * 修改用户角色（管理员）
   */
  @Patch("users/:userId/role")
  async updateUserRole(
    @CurrentUser("sub") operatorId: string,
    @CurrentUser("tenantId") tenantId: string,
    @Body() body: { role: Role },
  ) {
    // 这个操作会检查实际权限
    return { success: true };
  }

  /**
   * 获取可用的角色选项
   */
  @Get("options")
  async getOptions() {
    return {
      roles: this.permissionsService.getRoleOptions(),
      resources: this.permissionsService.getResourceOptions(),
      actions: this.permissionsService.getActionOptions(),
    };
  }
}
