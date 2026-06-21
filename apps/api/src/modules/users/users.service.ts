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
    return rest;
  }

  async list(tenantId: string): Promise<Omit<UserDto, never>[]> {
    return this.prisma.user.findMany({
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
    const user = await this.prisma.user.create({
      data: {
        id,
        tenantId,
        email: data.email,
        name: data.name,
        passwordHash,
        role: data.role || "viewer",
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

    const updated = await this.prisma.user.update({
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
}
