import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { TagsService } from "./tags.service";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { PermissionsGuard, RequirePermissions, AdminOnly } from "../../common/permissions/permissions.guard";
import { Resource, Action } from "../../common/permissions/permissions.types";
import {
  DocumentAccessService,
  type DocumentAction,
  type DocumentUserContext,
} from "../documents/document-access.service";

class CreateTagDto {
  name!: string;
  type?: string;
}

class UpdateTagDto {
  name?: string;
}

@UseGuards(AuthGuard("jwt"), PermissionsGuard)
@Controller("tags")
export class TagsController {
  constructor(
    private readonly tags: TagsService,
    private readonly documentAccess: DocumentAccessService,
  ) {}

  @Get()
  async list() {
    return this.tags.list();
  }

  @Get("stats")
  async getStats() {
    return this.tags.getStats();
  }

  @Get(":id")
  async getById(@Param("id") id: string) {
    const tag = await this.tags.list();
    return tag.find((t: any) => t.id === id);
  }

  @Post()
  @AdminOnly()
  async create(@Body() dto: CreateTagDto) {
    return this.tags.create(dto);
  }

  @Patch(":id")
  @AdminOnly()
  async update(@Param("id") id: string, @Body() dto: UpdateTagDto) {
    return this.tags.update(id, dto);
  }

  @Delete(":id")
  @AdminOnly()
  async remove(@Param("id") id: string) {
    return this.tags.remove(id);
  }

  // 文档标签操作
  @Post("documents/:documentId/tags/:tagId")
  @RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.UPDATE })
  async addTagToDocument(
    @Param("documentId") documentId: string,
    @Param("tagId") tagId: string,
    @CurrentUser() user: any,
  ) {
    await this.assertDocumentAccess(documentId, "EDIT", user);
    return this.tags.addTagToDocument(documentId, tagId);
  }

  @Delete("documents/:documentId/tags/:tagId")
  @RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.UPDATE })
  async removeTagFromDocument(
    @Param("documentId") documentId: string,
    @Param("tagId") tagId: string,
    @CurrentUser() user: any,
  ) {
    await this.assertDocumentAccess(documentId, "EDIT", user);
    return this.tags.removeTagFromDocument(documentId, tagId);
  }

  @Get("documents/:documentId")
  async getDocumentTags(@Param("documentId") documentId: string, @CurrentUser() user: any) {
    await this.assertDocumentAccess(documentId, "VIEW", user);
    return this.tags.getDocumentTags(documentId);
  }

  private assertDocumentAccess(documentId: string, action: DocumentAction, user: any) {
    return this.documentAccess.assertDocumentAccess(
      documentId,
      action,
      this.toDocumentUserContext(user),
    );
  }

  private toDocumentUserContext(user: any): DocumentUserContext {
    return {
      userId: user?.sub ?? user?.userId ?? user?.id,
      tenantId: user?.tenantId,
      role: user?.role ?? "viewer",
      departmentId: user?.departmentId ?? null,
    };
  }
}
