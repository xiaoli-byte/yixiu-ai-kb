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
export class TagsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async list() {
    return this.prisma.tag.findMany({
      orderBy: { name: "asc" },
    });
  }

  async create(data: { name: string; type?: string }) {
    const existing = await this.prisma.tag.findFirst({
      where: { name: data.name, type: data.type || "MANUAL" },
    });
    if (existing) {
      throw new ConflictException("标签已存在");
    }

    return this.prisma.tag.create({
      data: {
        id: uuid(),
        name: data.name,
        type: data.type || "MANUAL",
      },
    });
  }

  async update(id: string, data: { name?: string }) {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException("标签不存在");

    if (data.name) {
      const existing = await this.prisma.tag.findFirst({
        where: { name: data.name, type: tag.type, id: { not: id } },
      });
      if (existing) throw new ConflictException("标签名称已存在");
    }

    return this.prisma.tag.update({
      where: { id },
      data: { name: data.name },
    });
  }

  async remove(id: string) {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException("标签不存在");

    await this.prisma.tag.delete({ where: { id } });
    return { id };
  }

  // 为文档添加标签
  async addTagToDocument(documentId: string, tagId: string) {
    const [doc, tag] = await Promise.all([
      this.prisma.document.findUnique({ where: { id: documentId } }),
      this.prisma.tag.findUnique({ where: { id: tagId } }),
    ]);
    if (!doc) throw new NotFoundException("文档不存在");
    if (!tag) throw new NotFoundException("标签不存在");

    try {
      await this.prisma.documentTag.create({
        data: { documentId, tagId },
      });
    } catch {
      // 忽略重复添加
    }
    return { documentId, tagId };
  }

  // 为文档移除标签
  async removeTagFromDocument(documentId: string, tagId: string) {
    await this.prisma.documentTag.deleteMany({
      where: { documentId, tagId },
    });
    return { documentId, tagId };
  }

  // 获取文档的标签
  async getDocumentTags(documentId: string) {
    const tags = await this.prisma.documentTag.findMany({
      where: { documentId },
      include: { tag: true },
    });
    return tags.map((dt: typeof tags[number]) => dt.tag);
  }

  // 获取标签使用统计
  async getStats() {
    const tags = await this.prisma.tag.findMany({
      include: {
        _count: { select: { documents: true } },
      },
    });
    return tags.map((t: typeof tags[number]) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      documentCount: t._count.documents,
    }));
  }
}
