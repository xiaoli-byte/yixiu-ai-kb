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
import { FoldersService } from "./folders.service";
import { DatabaseService } from "../../database/database.service";
import { PermissionsGuard, RequirePermissions, AdminOnly } from "../../common/permissions/permissions.guard";
import { Resource, Action } from "../../common/permissions/permissions.types";

class CreateFolderDto {
  name!: string;
  parentId?: string;
}

class UpdateFolderDto {
  name?: string;
  parentId?: string;
}

@UseGuards(AuthGuard("jwt"), PermissionsGuard)
@Controller("folders")
export class FoldersController {
  constructor(
    private readonly folders: FoldersService,
    private readonly db: DatabaseService,
  ) {}

  @Get()
  async list() {
    return this.folders.list(this.db.tenantId!);
  }

  @Get("tree")
  async getTree() {
    return this.folders.getFolderTree(this.db.tenantId!);
  }

  @Get(":id")
  async getById(@Param("id") id: string) {
    const folder = await this.folders.list(this.db.tenantId!);
    return folder.find((f: any) => f.id === id);
  }

  @Get(":id/stats")
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
