import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PRISMA } from "../../database/database.service";
import * as bcrypt from "bcrypt";
import { v4 as uuid } from "uuid";
import { resolveKbRole } from "@xiaoli-byte/authz";

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: string;
  departmentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserData {
  email: string;
  name: string;
  password: string;
  role?: string;
  departmentId?: string;
}

export interface UpdateUserData {
  name?: string;
  role?: string;
  departmentId?: string;
}

@Injectable()
export class UsersService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Omit<UserDto, never>> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException("用户不存在");
    const { passwordHash, ...rest } = u;
    return { ...rest, role: await this.getEffectiveRole(u.id, u.tenantId, u.role) };
  }

  async list(tenantId: string): Promise<Omit<UserDto, never>[]> {
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        departmentId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(
      users.map(async (user) => ({
        ...user,
        role: await this.getEffectiveRole(user.id, tenantId, user.role),
      })),
    );
  }

  async create(
    tenantId: string,
    data: CreateUserData,
  ): Promise<Omit<UserDto, never>> {
    const exists = await this.prisma.user.findFirst({
      where: { email: data.email, tenantId },
    });
    if (exists) {
      throw new ConflictException("该邮箱已被注册");
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const id = uuid();
    const role = data.role || "viewer";
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          id,
          tenantId,
          email: data.email,
          name: data.name,
          passwordHash,
          role,
          departmentId: data.departmentId || null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          departmentId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      await tx.membership.create({ data: { userId: id, tenantId, roles: [role] } });
      return created;
    });
    return user;
  }

  async update(
    id: string,
    tenantId: string,
    data: UpdateUserData,
  ): Promise<Omit<UserDto, never>> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
    });
    if (!user) throw new NotFoundException("用户不存在");

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id },
        data: {
          name: data.name,
          role: data.role,
          departmentId: data.departmentId,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          departmentId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (data.role) {
        await tx.membership.upsert({
          where: { userId_tenantId: { userId: id, tenantId } },
          create: { userId: id, tenantId, roles: [data.role] },
          update: { roles: [data.role] },
        });
      }
      return result;
    });
    return updated;
  }

  async remove(id: string, tenantId: string): Promise<{ id: string }> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
    });
    if (!user) throw new NotFoundException("用户不存在");

    await this.prisma.user.delete({ where: { id } });
    return { id };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("用户不存在");

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException("当前密码不正确");

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: "密码修改成功" };
  }

  async resetPassword(
    id: string,
    tenantId: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
    });
    if (!user) throw new NotFoundException("用户不存在");

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    return { message: "密码重置成功" };
  }

  private async getEffectiveRole(userId: string, tenantId: string, legacyRole: string): Promise<string> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { roles: true },
    });
    return resolveKbRole(membership?.roles ?? []).role ?? legacyRole;
  }
}
