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
import { FoldersService } from "./folders.service";
import { DatabaseService } from "../../database/database.service";
import { RequirePermissions, AdminOnly, AnyAuthenticated } from "../../common/permissions/permissions.guard";
import { Resource, Action } from "../../common/permissions/permissions.types";
import { Public } from "../../common/decorators/public.decorator";
import { ServiceAuthGuard } from "@xiaoli-byte/authz";

class CreateFolderDto {
  name!: string;
  parentId?: string;
}

class UpdateFolderDto {
  name?: string;
  parentId?: string;
}

@Controller("folders")
export class FoldersController {
  constructor(
    private readonly folders: FoldersService,
    private readonly db: DatabaseService,
  ) {}

  @Get()
  @AnyAuthenticated()
  async list() {
    return this.folders.list(this.db.tenantId!);
  }

  @Get("tree")
  @AnyAuthenticated()
  async getTree() {
    return this.folders.getFolderTree(this.db.tenantId!);
  }

  /**
   * 仅供 ai-call 场景配置读取当前租户可关联的知识库目录。
   * @Public 只绕过用户 JWT；ServiceAuthGuard 仍负责服务令牌与租户身份注入。
   */
  @Get("selectable")
  @Public()
  @UseGuards(ServiceAuthGuard)
  async listSelectable() {
    return this.folders.list(this.db.tenantId!);
  }

  @Get(":id")
  @AnyAuthenticated()
  async getById(@Param("id") id: string) {
    const folder = await this.folders.list(this.db.tenantId!);
    return folder.find((f: any) => f.id === id);
  }

  @Get(":id/stats")
  @AnyAuthenticated()
  async getStats(@Param("id") id: string) {
    return this.folders.getStats(id, this.db.tenantId!);
  }

  @Post()
  @RequirePermissions({ resource: Resource.FOLDERS, action: Action.CREATE })
  async create(@Body() dto: CreateFolderDto) {
    return this.folders.create(this.db.tenantId!, dto);
  }

  @Patch(":id")
  @RequirePermissions({ resource: Resource.FOLDERS, action: Action.UPDATE })
  async update(@Param("id") id: string, @Body() dto: UpdateFolderDto) {
    return this.folders.update(id, this.db.tenantId!, dto);
  }

  @Delete(":id")
  @RequirePermissions({ resource: Resource.FOLDERS, action: Action.DELETE })
  async remove(@Param("id") id: string) {
    return this.folders.remove(id, this.db.tenantId!);
  }
}
