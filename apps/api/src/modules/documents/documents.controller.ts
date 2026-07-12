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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import { AuthGuard } from "@nestjs/passport";
import { DocumentListQuery, DocumentUpdateRequest } from "@ai-knowledge/schemas";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { PermissionsGuard, RequirePermissions } from "../../common/permissions/permissions.guard";
import { Action, Resource } from "../../common/permissions/permissions.types";
import { RateLimit, RateLimitPolicies } from "../../common/rate-limit/rate-limit.guard";
import { DatabaseService } from "../../database/database.service";
import { FoldersService } from "../folders/folders.service";
import { DocumentsService } from "./documents.service";

@UseGuards(AuthGuard("jwt"), PermissionsGuard)
@Controller("documents")
export class DocumentsController {
  constructor(
    private readonly docs: DocumentsService,
    private readonly db: DatabaseService,
    private readonly folders?: FoldersService,
  ) {}

  @Get()
  async list(@Query() query: unknown, @CurrentUser() user: any) {
    const result = DocumentListQuery.safeParse(query);
    if (!result.success) throw new BadRequestException("Invalid document query");
    return this.docs.list(result.data, user);
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

  @Post("folder")
  @RequirePermissions({ resource: Resource.FOLDERS, action: Action.CREATE })
  async createFolder(@Body() body: { name: string; parentId?: string }, @CurrentUser() user: any) {
    if (!this.folders) throw new BadRequestException("Folders service is unavailable");
    return this.folders.create(user?.tenantId ?? this.db.tenantId!, body);
  }

  @Post("batch/upload")
  @RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.CREATE })
  @UseInterceptors(FilesInterceptor("files", 50))
  @RateLimit({ ...RateLimitPolicies.upload, message: "Upload too frequent, please try again later" })
  async batchUpload(
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: any,
    @Body("folderId") folderId?: string,
  ) {
    if (!files || files.length === 0) throw new BadRequestException("Missing files");
    const tenantId = user?.tenantId ?? this.db.tenantId!;
    const userId = user?.sub ?? user?.userId ?? user?.id ?? this.db.userId!;
    return this.docs.batchUpload(files, userId, tenantId, folderId);
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
    @Body() body: unknown,
    @CurrentUser() user: any,
  ) {
    const result = DocumentUpdateRequest.safeParse(body);
    if (!result.success) throw new BadRequestException("Invalid document update request");
    return this.docs.update(id, result.data, user);
  }

  @Delete(":id")
  @RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.DELETE })
  async remove(@Param("id") id: string, @CurrentUser() user: any) {
    return this.docs.remove(id, user);
  }
}
