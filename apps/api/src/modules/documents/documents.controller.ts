import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Patch,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard } from "@nestjs/passport";
import { DocumentsService } from "./documents.service";
import { TagsService } from "../tags/tags.service";
import { DatabaseService } from "../../database/database.service";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AdminGuard } from "../../common/guards/admin.guard";
import { RateLimit, RateLimitPolicies } from "../../common/rate-limit/rate-limit.guard";
import { PermissionsGuard, RequirePermissions, AdminOnly, EditorOrAbove } from "../../common/permissions/permissions.guard";
import { Resource, Action } from "../../common/permissions/permissions.types";

@UseGuards(AuthGuard("jwt"), PermissionsGuard)
@Controller("documents")
export class DocumentsController {
  constructor(
    private readonly docs: DocumentsService,
    private readonly tags: TagsService,
    private readonly db: DatabaseService,
  ) {}

  @Get()
  async list(
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("folderId") folderId?: string,
    @Query("tags") tags?: string,
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "20",
  ) {
    const tagIds = tags
      ? tags.split(",").map((t) => t.trim()).filter((t) => t.length > 0)
      : undefined;
    return this.docs.list({
      q,
      status,
      folderId,
      tags: tagIds,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20,
    });
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    return this.docs.getDetail(id);
  }

  @Post("upload")
  @RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.CREATE })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: Number(process.env.DOCUMENT_UPLOAD_MAX_MB) * 1024 * 1024 },
    }),
  )
  @RateLimit({ ...RateLimitPolicies.upload, message: "上传过于频繁，请稍后再试" })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser("sub") userId: string,
    @Body("folderId") folderId?: string,
  ) {
    if (!file) throw new BadRequestException("缺少文件");
    const tenantId = this.db.tenantId!;
    return this.docs.upload(file, userId, tenantId, folderId);
  }

  @Patch(":id")
  @RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.UPDATE })
  async update(
    @Param("id") id: string,
    @Body() body: { title?: string; folderId?: string | null },
  ) {
    return this.docs.update(id, body);
  }

  @Delete(":id")
  @RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.DELETE })
  async remove(@Param("id") id: string) {
    return this.docs.remove(id);
  }

  // 文档标签操作
  @Post(":id/tags/:tagId")
  @RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.UPDATE })
  addTag(@Param("id") id: string, @Param("tagId") tagId: string) {
    return this.tags.addTagToDocument(id, tagId);
  }

  @Delete(":id/tags/:tagId")
  @RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.UPDATE })
  removeTag(@Param("id") id: string, @Param("tagId") tagId: string) {
    return this.tags.removeTagFromDocument(id, tagId);
  }
}
