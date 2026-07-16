import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { Role, Resource, Action, ROLE_HIERARCHY, UserContext } from "./permissions.types";
import { PermissionsService } from "./permissions.service";
import { PRISMA } from "@/database/database.service";
import { resolveKbRole } from "@xiaoli-byte/authz";

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
    if (!user) return null;
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { roles: true },
    });
    return this.resolveRole(membership?.roles, user.role);
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

    // 角色值必须在本地词表内（body 直传，不校验会把任意字符串写进 user.role）
    if (!Object.values(Role).includes(newRole)) {
      throw new BadRequestException("非法的角色值");
    }

    // 不能授出高于自身层级的角色（admin 不能提拔 super_admin）
    const operatorRank = ROLE_HIERARCHY[operator.role] ?? 0;
    if (ROLE_HIERARCHY[newRole] > operatorRank) {
      throw new BadRequestException("不能授予高于自身的角色");
    }

    // 检查目标用户存在且在同一租户
    const targetUser = await this.prisma.user.findFirst({
      where: { id: targetUserId, tenantId: operator.tenantId },
    });

    if (!targetUser) {
      throw new NotFoundException("用户不存在或不在同一租户");
    }

    // 不能改动权限比自己高的用户（admin 不能降级 super_admin）。
    // 词表外的遗留脏角色按最低层级对待，允许管理员通过本接口修复。
    const currentRole = await this.getUserRole(targetUserId, operator.tenantId);
    if ((ROLE_HIERARCHY[currentRole ?? (targetUser.role as Role)] ?? 0) > operatorRank) {
      throw new BadRequestException("不能修改权限高于自身的用户");
    }

    // 更新角色
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: targetUserId },
        data: { role: newRole },
      }),
      this.prisma.membership.upsert({
        where: { userId_tenantId: { userId: targetUserId, tenantId: operator.tenantId } },
        create: { userId: targetUserId, tenantId: operator.tenantId, roles: [newRole] },
        update: { roles: [newRole] },
      }),
    ]);

    this.logger.log(
      `用户 ${operator.userId} 将用户 ${targetUserId} 的角色从 ${currentRole ?? targetUser.role} 更改为 ${newRole}`,
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

    const memberships = await this.prisma.membership.findMany({
      where: { tenantId: operator.tenantId },
      select: { userId: true, roles: true },
    });
    const rolesByUser = new Map(memberships.map((membership) => [membership.userId, membership.roles]));
    return users.map((u: typeof users[number]) => ({
      ...u,
      role: this.resolveRole(rolesByUser.get(u.id), u.role),
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
    const stats: Record<Role, number> = {
      [Role.SUPER_ADMIN]: 0,
      [Role.ADMIN]: 0,
      [Role.EDITOR]: 0,
      [Role.VIEWER]: 0,
    };

    const users = await this.prisma.user.findMany({
      where: { tenantId },
      select: { id: true, role: true },
    });
    const memberships = await this.prisma.membership.findMany({
      where: { tenantId },
      select: { userId: true, roles: true },
    });
    const rolesByUser = new Map(memberships.map((membership) => [membership.userId, membership.roles]));
    for (const user of users) {
      const role = this.resolveRole(rolesByUser.get(user.id), user.role);
      stats[role] += 1;
    }

    return stats;
  }

  private resolveRole(roles: readonly string[] | undefined, fallback: string): Role {
    return (resolveKbRole(roles ?? []).role ?? fallback) as Role;
  }
}
