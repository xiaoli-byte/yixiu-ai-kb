import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { RolesManagementService } from "./roles-management.service";
import { PermissionsService } from "./permissions.service";
import { Role, UserContext } from "./permissions.types";

function makeService() {
  const prisma = {
    user: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
    },
    membership: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  const service = new RolesManagementService(prisma as any, new PermissionsService());
  return { service, prisma };
}

const admin: UserContext = { userId: "op-1", tenantId: "t-1", role: Role.ADMIN };

describe("RolesManagementService.updateUserRole", () => {
  let service: RolesManagementService;
  let prisma: ReturnType<typeof makeService>["prisma"];

  beforeEach(() => {
    ({ service, prisma } = makeService());
  });

  it("非管理员操作者被拒绝", async () => {
    const editor: UserContext = { ...admin, role: Role.EDITOR };
    await expect(service.updateUserRole(editor, "u-2", Role.VIEWER)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("不能修改自己的角色", async () => {
    await expect(service.updateUserRole(admin, admin.userId, Role.VIEWER)).rejects.toThrow(
      "不能修改自己的角色",
    );
  });

  it("词表外的角色值被拒绝（body 直传，防任意字符串写库）", async () => {
    await expect(
      service.updateUserRole(admin, "u-2", "hacker" as Role),
    ).rejects.toThrow("非法的角色值");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("admin 不能授出 super_admin（不能授予高于自身的角色）", async () => {
    await expect(service.updateUserRole(admin, "u-2", Role.SUPER_ADMIN)).rejects.toThrow(
      "不能授予高于自身的角色",
    );
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("目标用户不存在或不在同一租户时抛 NotFound", async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.updateUserRole(admin, "u-2", Role.EDITOR)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("admin 不能改动 super_admin 用户", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "u-2", role: "super_admin" });
    await expect(service.updateUserRole(admin, "u-2", Role.VIEWER)).rejects.toThrow(
      "不能修改权限高于自身的用户",
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("正常路径：admin 将 viewer 提升为 editor 并落库", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "u-2", role: "viewer" });
    prisma.user.update.mockResolvedValue({});

    await service.updateUserRole(admin, "u-2", Role.EDITOR);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: "u-2", tenantId: admin.tenantId },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u-2" },
      data: { role: Role.EDITOR },
    });
    expect(prisma.membership.upsert).toHaveBeenCalledWith({
      where: { userId_tenantId: { userId: "u-2", tenantId: admin.tenantId } },
      create: { userId: "u-2", tenantId: admin.tenantId, roles: [Role.EDITOR] },
      update: { roles: [Role.EDITOR] },
    });
  });

  it("目标角色是词表外遗留脏值时按最低层级对待，允许管理员修复", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "u-2", role: "operator" });
    prisma.user.update.mockResolvedValue({});

    await service.updateUserRole(admin, "u-2", Role.EDITOR);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u-2" },
      data: { role: Role.EDITOR },
    });
  });

  it("super_admin 可以授出 super_admin", async () => {
    const root: UserContext = { ...admin, role: Role.SUPER_ADMIN };
    prisma.user.findFirst.mockResolvedValue({ id: "u-2", role: "admin" });
    prisma.user.update.mockResolvedValue({});

    await service.updateUserRole(root, "u-2", Role.SUPER_ADMIN);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u-2" },
      data: { role: Role.SUPER_ADMIN },
    });
  });
});
