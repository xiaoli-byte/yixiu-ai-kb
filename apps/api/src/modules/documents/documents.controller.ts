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
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import { DocumentListQuery, DocumentUpdateRequest } from "@ai-knowledge/schemas";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions, AnyAuthenticated } from "../../common/permissions/permissions.guard";
import { Action, Resource } from "../../common/permissions/permissions.types";
import { RateLimit, RateLimitPolicies } from "../../common/rate-limit/rate-limit.guard";
import { DatabaseService } from "../../database/database.service";
import { FoldersService } from "../folders/folders.service";
import { DocumentsService } from "./documents.service";

@Controller("documents")
export class DocumentsController {
  constructor(
    private readonly docs: DocumentsService,
    private readonly db: DatabaseService,
    private readonly folders?: FoldersService,
  ) {}

  @Get()
  @AnyAuthenticated()
  async list(@Query() query: unknown, @CurrentUser() user: any) {
    const result = DocumentListQuery.safeParse(query);
    if (!result.success) throw new BadRequestException("Invalid document query");
    return this.docs.list(result.data, user);
  }

  @Get(":id/permissions")
  @AnyAuthenticated()
  async getPermissions(@Param("id") id: string, @CurrentUser() user: any) {
    return this.docs.getPermissions(id, user);
  }

  @Get(":id")
  @AnyAuthenticated()
  async detail(@Param("id") id: string, @CurrentUser() user: any) {
    return this.docs.getDetail(id, user);
  }

  // 以下写口的角色层门禁取 UPDATE 而非 MANAGE：MANAGE 仅 admin 持有，会挡掉持逐文档显式授权的
  // editor；细粒度判定（含显式授权/归属）仍由 service 的 assertDocumentAccess ACL 兜底，
  // 角色层只负责挡住只读角色（viewer 及未知联合角色）。
  @Put("batch/permissions")
  @RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.UPDATE })
  async setBatchPermissions(@Body() body: unknown, @CurrentUser() user: any) {
    return this.docs.setBatchPermissions(body, user);
  }

  @Post("batch")
  @RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.UPDATE })
  async batch(@Body() body: unknown, @CurrentUser() user: any) {
    // 批量动作里的删除/归档等，由 service 逐条 assert EDIT/DELETE
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
  @RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.UPDATE })
  async setPermissions(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: any) {
    return this.docs.setPermissions(id, body, user);
  }

  @Post(":id/parse/retry")
  @RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.UPDATE })
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
