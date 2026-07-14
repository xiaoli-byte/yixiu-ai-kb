import { Controller, Get, Patch, Body, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUser } from "../decorators/current-user.decorator";
import { AdminOnly } from "./permissions.guard";
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
   * 用户目录属管理员能力（与 users.controller 的 AdminOnly 口径对齐）；前端当前无调用，收紧零影响。
   */
  @Get("users")
  @AdminOnly()
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
   * ⚠️ KB-05 半成品桩：尚未落库，仅返回 success 占位。
   * @AdminOnly 必须保留——没有它任意登录用户都能调本端点，补齐落库实现时即成提权漏洞。
   */
  @Patch("users/:userId/role")
  @AdminOnly()
  async updateUserRole(
    @CurrentUser("sub") operatorId: string,
    @CurrentUser("tenantId") tenantId: string,
    @Body() body: { role: Role },
  ) {
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
