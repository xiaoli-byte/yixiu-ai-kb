import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PRISMA } from "../../database/database.service";
import { DatabaseService } from "../../database/database.service";
import { StorageService } from "../storage/storage.service";
import { QueueService } from "../queue/queue.service";
import { v4 as uuid } from "uuid";
import { extname } from "path";

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
  ) {}

  async list(opts: {
    q?: string;
    status?: string;
    folderId?: string;
    tags?: string[];
    page: number;
    pageSize: number;
  }) {
    const tenantId = this.db.tenantId!;
    const where: any = { tenantId };
    if (opts.status) where.status = opts.status;
    if (opts.q) where.title = { contains: opts.q, mode: "insensitive" };
    if (opts.folderId === "root") {
      where.folderId = null;
    } else if (opts.folderId) {
      where.folderId = opts.folderId;
    }
    if (opts.tags && opts.tags.length > 0) {
      where.tags = {
        some: {
          tag: {
            id: { in: opts.tags },
          },
        },
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        include: {
          owner: { select: { id: true, name: true } },
          tags: { include: { tag: true } },
        },
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      items: items.map((d) => ({
        id: d.id,
        title: d.title,
        mime: d.mime,
        size: Number(d.size),
        status: d.status,
        folderId: d.folderId,
        ownerId: d.ownerId,
        ownerName: d.owner?.name,
        tags: d.tags.map((t) => ({ id: t.tag.id, name: t.tag.name })),
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      })),
      total,
      page: opts.page,
      pageSize: opts.pageSize,
    };
  }

  async getDetail(id: string) {
    const tenantId = this.db.tenantId!;
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId },
      include: {
        owner: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
      },
    });
    if (!doc) throw new NotFoundException("文档不存在");
    const chunks = await this.db.query<{ id: string; idx: number; text: string; tokens: number }>(
      `SELECT id, idx, text, tokens FROM chunks WHERE document_id=$1 ORDER BY idx ASC`,
      [id],
    );
    return {
      id: doc.id,
      title: doc.title,
      mime: doc.mime,
      size: Number(doc.size),
      status: doc.status,
      folderId: doc.folderId,
      ownerId: doc.ownerId,
      ownerName: doc.owner?.name,
      tags: doc.tags.map((t) => ({ id: t.tag.id, name: t.tag.name })),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      errorMessage: doc.errorMessage,
      chunks: chunks.map((c) => ({ id: c.id, idx: c.idx, text: c.text, tokens: c.tokens })),
    };
  }

  async upload(file: Express.Multer.File, ownerId: string, tenantId: string, folderId?: string) {
    if (!file) throw new BadRequestException("缺少文件");
    // multer/FileInterceptor 默认用 latin1 解码 multipart 的 originalname,中文会被破坏。
    // 把字节当 latin1 还原成 Buffer,再按 utf8 解码,英文文件名不受影响。
    const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
    const ext = extname(originalName) || "";
    const id = uuid();
    const key = `${tenantId}/${id}${ext}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);

    const doc = await this.prisma.document.create({
      data: {
        id,
        tenantId,
        ownerId,
        folderId: folderId || null,
        title: originalName,
        mime: file.mimetype,
        size: BigInt(file.size),
        status: "PENDING",
        storageKey: key,
      },
    });

    await this.queue.enqueueDocument({ documentId: doc.id, tenantId });

    return {
      id: doc.id,
      title: doc.title,
      status: doc.status,
    };
  }

  async update(id: string, data: { title?: string; folderId?: string | null }) {
    const tenantId = this.db.tenantId!;
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId },
    });
    if (!doc) throw new NotFoundException("文档不存在");

    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        title: data.title,
        folderId: data.folderId,
      },
    });

    return {
      id: updated.id,
      title: updated.title,
      mime: updated.mime,
      size: Number(updated.size),
      status: updated.status,
      folderId: updated.folderId,
      ownerId: updated.ownerId,
      tenantId: updated.tenantId,
      errorMessage: updated.errorMessage,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async remove(id: string) {
    const tenantId = this.db.tenantId!;
    const doc = await this.prisma.document.findFirst({ where: { id, tenantId } });
    if (!doc) throw new NotFoundException("文档不存在");
    await this.storage.removeObject(doc.storageKey).catch(() => undefined);
    await this.prisma.document.delete({ where: { id } });
    return { id };
  }
}