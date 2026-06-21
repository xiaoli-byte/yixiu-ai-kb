import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PRISMA } from "../../database/database.service";
import { v4 as uuid } from "uuid";

@Injectable()
export class DepartmentsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async list(tenantId: string) {
    return this.prisma.department.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(
    tenantId: string,
    data: { name: string; parentId?: string },
  ) {
    const existing = await this.prisma.department.findFirst({
      where: { tenantId, name: data.name },
    });
    if (existing) {
      throw new ConflictException("部门名称已存在");
    }

    return this.prisma.department.create({
      data: {
        id: uuid(),
        tenantId,
        name: data.name,
        parentId: data.parentId || null,
      },
    });
  }

  async update(
    id: string,
    tenantId: string,
    data: { name?: string; parentId?: string },
  ) {
    const dept = await this.prisma.department.findFirst({
      where: { id, tenantId },
    });
    if (!dept) throw new NotFoundException("部门不存在");

    if (data.name) {
      const existing = await this.prisma.department.findFirst({
        where: { tenantId, name: data.name, id: { not: id } },
      });
      if (existing) throw new ConflictException("部门名称已存在");
    }

    return this.prisma.department.update({
      where: { id },
      data: {
        name: data.name,
        parentId: data.parentId,
      },
    });
  }

  async remove(id: string, tenantId: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id, tenantId },
    });
    if (!dept) throw new NotFoundException("部门不存在");

    // 将属于该部门的用户移到无部门状态
    await this.prisma.user.updateMany({
      where: { departmentId: id, tenantId },
      data: { departmentId: null },
    });

    // 将子部门移到顶级
    await this.prisma.department.updateMany({
      where: { parentId: id, tenantId },
      data: { parentId: null },
    });

    await this.prisma.department.delete({ where: { id } });
    return { id };
  }
}
