import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard } from "@nestjs/passport";
import { DocumentListQuery } from "@ai-knowledge/schemas";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { PermissionsGuard, RequirePermissions } from "../../common/permissions/permissions.guard";
import { Action, Resource } from "../../common/permissions/permissions.types";
import { RateLimit, RateLimitPolicies } from "../../common/rate-limit/rate-limit.guard";
import { DatabaseService } from "../../database/database.service";
import { TagsService } from "../tags/tags.service";
import { DocumentsService } from "./documents.service";

@UseGuards(AuthGuard("jwt"), PermissionsGuard)
@Controller("documents")
export class DocumentsController {
  constructor(
    private readonly docs: DocumentsService,
    private readonly tags: TagsService,
    private readonly db: DatabaseService,
  ) {}

  @Get()
  async list(@Query() query: unknown, @CurrentUser() user: any) {
    const result = DocumentListQuery.safeParse(query);
    if (!result.success) throw new BadRequestException("Invalid document query");
    const parsed = result.data;
    const tagIds = parsed.tags
      ? parsed.tags.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0)
      : undefined;
    return this.docs.list({ ...parsed, tags: tagIds }, user);
  }

  @Get(":id/permissions")
  async getPermissions(@Param("id") id: string, @CurrentUser() user: any) {
    return this.docs.getPermissions(id, user);
  }

  @Get(":id")
  async detail(@Param("id") id: string, @CurrentUser() user: any) {
    return this.docs.getDetail(id, user);
  }

  @Put("batch/permissions")
  async setBatchPermissions(@Body() body: unknown, @CurrentUser() user: any) {
    return this.docs.setBatchPermissions(body, user);
  }

  @Post("batch")
  async batch(@Body() body: unknown, @CurrentUser() user: any) {
    return this.docs.batch(body, user);
  }

  @Post("upload")
  @RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.CREATE })
  @UseInterceptors(FileInterceptor("file"))
  @RateLimit({ ...RateLimitPolicies.upload, message: "Upload too frequent, please try again later" })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
    @Body("folderId") folderId?: string,
  ) {
    if (!file) throw new BadRequestException("Missing file");
    const tenantId = user?.tenantId ?? this.db.tenantId!;
    const userId = user?.sub ?? user?.userId ?? user?.id ?? this.db.userId!;
    return this.docs.upload(file, userId, tenantId, folderId);
  }

  @Put(":id/permissions")
  async setPermissions(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: any) {
    return this.docs.setPermissions(id, body, user);
  }

  @Post(":id/parse/retry")
  async retryParse(@Param("id") id: string, @CurrentUser() user: any) {
    return this.docs.retryParse(id, user);
  }

  @Patch(":id")
  @RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.UPDATE })
  async update(
    @Param("id") id: string,
    @Body() body: { title?: string; folderId?: string | null },
    @CurrentUser() user: any,
  ) {
    return this.docs.update(id, body, user);
  }

  @Delete(":id")
  @RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.DELETE })
  async remove(@Param("id") id: string, @CurrentUser() user: any) {
    return this.docs.remove(id, user);
  }

  @Post(":id/tags/:tagId")
  @RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.UPDATE })
  async addTag(
    @Param("id") id: string,
    @Param("tagId") tagId: string,
    @CurrentUser() user: any,
  ) {
    await this.docs.assertDocumentEditAccess(id, user);
    return this.tags.addTagToDocument(id, tagId);
  }

  @Delete(":id/tags/:tagId")
  @RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.UPDATE })
  async removeTag(
    @Param("id") id: string,
    @Param("tagId") tagId: string,
    @CurrentUser() user: any,
  ) {
    await this.docs.assertDocumentEditAccess(id, user);
    return this.tags.removeTagFromDocument(id, tagId);
  }
}
