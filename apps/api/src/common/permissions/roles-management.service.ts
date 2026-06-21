import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { Role, Resource, Action, UserContext } from "./permissions.types";
import { PermissionsService } from "./permissions.service";
import { PRISMA } from "@/database/database.service";

/**
 * 角色管理服务
 * 提供角色分配和权限管理功能
 */
@Injectable()
export class RolesManagementService {
  private readonly logger = new Logger(RolesManagementService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly permissionsService: PermissionsService,
  ) {}

  /**
   * 获取用户在指定租户的角色
   */
  async getUserRole(userId: string, tenantId: string): Promise<Role | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { role: true },
    });
    return user ? (user.role as Role) : null;
  }

  /**
   * 修改用户角色
   */
  async updateUserRole(
    operator: UserContext,
    targetUserId: string,
    newRole: Role,
  ): Promise<void> {
    // 检查操作者权限
    if (!this.permissionsService.isAdmin(operator)) {
      throw new BadRequestException("只有管理员才能修改用户角色");
    }

    // 不能修改自己的角色
    if (operator.userId === targetUserId) {
      throw new BadRequestException("不能修改自己的角色");
    }

    // 检查目标用户存在且在同一租户
    const targetUser = await this.prisma.user.findFirst({
      where: { id: targetUserId, tenantId: operator.tenantId },
    });

    if (!targetUser) {
      throw new NotFoundException("用户不存在或不在同一租户");
    }

    // 更新角色
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole },
    });

    this.logger.log(
      `用户 ${operator.userId} 将用户 ${targetUserId} 的角色从 ${targetUser.role} 更改为 ${newRole}`,
    );
  }

  /**
   * 批量修改用户角色
   */
  async batchUpdateUserRoles(
    operator: UserContext,
    updates: Array<{ userId: string; role: Role }>,
  ): Promise<{ success: number; failed: number }> {
    if (!this.permissionsService.isAdmin(operator)) {
      throw new BadRequestException("只有管理员才能修改用户角色");
    }

    let success = 0;
    let failed = 0;

    for (const update of updates) {
      try {
        await this.updateUserRole(operator, update.userId, update.role);
        success++;
      } catch (e: any) {
        this.logger.warn(`修改用户 ${update.userId} 角色失败: ${e.message}`);
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * 获取租户下的所有用户及其角色
   */
  async getTenantUsersWithRoles(operator: UserContext): Promise<
    Array<{
      id: string;
      name: string;
      email: string;
      role: Role;
      departmentId: string | null;
      createdAt: Date;
    }>
  > {
    if (!this.permissionsService.canAccess(operator, Resource.USERS)) {
      throw new BadRequestException("您没有权限查看用户列表");
    }

    const users = await this.prisma.user.findMany({
      where: { tenantId: operator.tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        departmentId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return users.map((u) => ({
      ...u,
      role: u.role as Role,
    }));
  }

  /**
   * 检查用户是否可以执行特定操作
   */
  async checkPermission(
    userId: string,
    tenantId: string,
    resource: Resource,
    action: Action,
  ): Promise<boolean> {
    const role = await this.getUserRole(userId, tenantId);
    if (!role) return false;

    return this.permissionsService.hasPermission(
      { userId, tenantId, role },
      resource,
      action,
    );
  }

  /**
   * 获取用户可用的资源权限列表
   */
  async getUserPermissions(userId: string, tenantId: string): Promise<{
    role: Role;
    permissions: Array<{ resource: Resource; actions: Action[] }>;
  }> {
    const role = await this.getUserRole(userId, tenantId);
    if (!role) {
      throw new NotFoundException("用户不存在");
    }

    const userContext: UserContext = { userId, tenantId, role };
    const permissions = this.permissionsService.getUserPermissions(userContext);

    return {
      role,
      permissions: permissions.map((p) => ({
        resource: p.resource,
        actions: p.actions,
      })),
    };
  }

  /**
   * 获取角色统计信息
   */
  async getRoleStatistics(tenantId: string): Promise<Record<Role, number>> {
    const users = await this.prisma.user.groupBy({
      by: ["role"],
      where: { tenantId },
      _count: { id: true },
    });

    const stats: Record<Role, number> = {
      [Role.SUPER_ADMIN]: 0,
      [Role.ADMIN]: 0,
      [Role.EDITOR]: 0,
      [Role.VIEWER]: 0,
    };

    for (const group of users) {
      stats[group.role as Role] = group._count.id;
    }

    return stats;
  }
}
