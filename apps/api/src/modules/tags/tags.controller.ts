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
import { DatabaseService } from "../../database/database.service";
import { PermissionsGuard, RequirePermissions, AdminOnly } from "../../common/permissions/permissions.guard";
import { Resource, Action } from "../../common/permissions/permissions.types";

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
    private readonly db: DatabaseService,
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
  ) {
    return this.tags.addTagToDocument(documentId, tagId);
  }

  @Delete("documents/:documentId/tags/:tagId")
  @RequirePermissions({ resource: Resource.DOCUMENTS, action: Action.UPDATE })
  async removeTagFromDocument(
    @Param("documentId") documentId: string,
    @Param("tagId") tagId: string,
  ) {
    return this.tags.removeTagFromDocument(documentId, tagId);
  }

  @Get("documents/:documentId")
  async getDocumentTags(@Param("documentId") documentId: string) {
    return this.tags.getDocumentTags(documentId);
  }
}
