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
export class FoldersService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async list(tenantId: string) {
    return this.prisma.folder.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });
  }

  async getFolderTree(tenantId: string) {
    const folders = await this.prisma.folder.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });

    interface FolderNode { id: string; name: string; parentId: string | null; children: FolderNode[] }

    const buildTree = (parentId: string | null): FolderNode[] => {
      return folders
        .filter((f: typeof folders[number]) => f.parentId === parentId)
        .map((f: typeof folders[number]) => ({
          id: f.id,
          name: f.name,
          parentId: f.parentId,
          children: buildTree(f.id),
        }));
    };

    return buildTree(null);
  }

  async create(
    tenantId: string,
    data: { name: string; parentId?: string },
  ) {
    // 检查同名文件夹
    const existing = await this.prisma.folder.findFirst({
      where: {
        tenantId,
        name: data.name,
        parentId: data.parentId || null,
      },
    });
    if (existing) {
      throw new ConflictException("同名文件夹已存在");
    }

    // 验证父文件夹存在
    if (data.parentId) {
      const parent = await this.prisma.folder.findFirst({
        where: { id: data.parentId, tenantId },
      });
      if (!parent) {
        throw new NotFoundException("父文件夹不存在");
      }
    }

    return this.prisma.folder.create({
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
    data: { name?: string; parentId?: string | null },
  ) {
    const folder = await this.prisma.folder.findFirst({
      where: { id, tenantId },
    });
    if (!folder) throw new NotFoundException("文件夹不存在");

    // 检查改名后是否冲突
    if (data.name) {
      const existing = await this.prisma.folder.findFirst({
        where: {
          tenantId,
          name: data.name,
          parentId: data.parentId === undefined ? folder.parentId : data.parentId,
          id: { not: id },
        },
      });
      if (existing) throw new ConflictException("同名文件夹已存在");
    }

    // 禁止将文件夹移入自己或自己的子文件夹
    if (data.parentId) {
      const isDescendant = await this.isDescendant(id, data.parentId);
      if (isDescendant) {
        throw new ConflictException("不能将文件夹移入自己的子文件夹");
      }
    }

    return this.prisma.folder.update({
      where: { id },
      data: {
        name: data.name,
        parentId: data.parentId,
      },
    });
  }

  private async isDescendant(parentId: string, childId: string): Promise<boolean> {
    if (parentId === childId) return true;
    const children = await this.prisma.folder.findMany({
      where: { parentId },
      select: { id: true },
    });
    for (const child of children) {
      if (await this.isDescendant(child.id, childId)) return true;
    }
    return false;
  }

  async remove(id: string, tenantId: string) {
    const folder = await this.prisma.folder.findFirst({
      where: { id, tenantId },
    });
    if (!folder) throw new NotFoundException("文件夹不存在");

    // 将子文件夹移到顶级
    await this.prisma.folder.updateMany({
      where: { parentId: id, tenantId },
      data: { parentId: null },
    });

    // 该文件夹下的文档自动解除关联（ON DELETE SET NULL）
    await this.prisma.folder.delete({ where: { id } });
    return { id };
  }

  async getStats(id: string, tenantId: string) {
    const folder = await this.prisma.folder.findFirst({
      where: { id, tenantId },
    });
    if (!folder) throw new NotFoundException("文件夹不存在");

    const count = await this.prisma.document.count({
      where: { folderId: id, tenantId },
    });
    return { folderId: id, documentCount: count };
  }
}
