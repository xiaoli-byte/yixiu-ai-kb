import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { UsersService } from "./users.service";
import { DatabaseService } from "../../database/database.service";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { PermissionsGuard, RequirePermissions, AdminOnly } from "../../common/permissions/permissions.guard";
import { Resource, Action } from "../../common/permissions/permissions.types";
import { CreateUserDto, UpdateUserDto, ChangePasswordDto } from "../auth/dto";

@UseGuards(AuthGuard("jwt"), PermissionsGuard)
@Controller("users")
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly db: DatabaseService,
  ) {}

  @Get("me")
  async me(@CurrentUser("sub") id: string) {
    return this.users.findById(id);
  }

  @Get()
  @AdminOnly()
  async list() {
    const tenantId = this.db.tenantId!;
    return this.users.list(tenantId);
  }

  @Get(":id")
  async getById(@Param("id") id: string) {
    return this.users.findById(id);
  }

  @Post()
  @AdminOnly()
  async create(@Body() dto: CreateUserDto) {
    const tenantId = this.db.tenantId!;
    return this.users.create(tenantId, dto);
  }

  @Patch(":id")
  @AdminOnly()
  async update(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    const tenantId = this.db.tenantId!;
    return this.users.update(id, tenantId, dto);
  }

  @Delete(":id")
  @AdminOnly()
  async remove(@Param("id") id: string, @CurrentUser("sub") currentUserId: string) {
    const tenantId = this.db.tenantId!;
    if (id === currentUserId) {
      throw new BadRequestException("不能删除自己");
    }
    return this.users.remove(id, tenantId);
  }

  @Put("me/password")
  async changePassword(
    @CurrentUser("sub") userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.users.changePassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Post(":id/reset-password")
  @AdminOnly()
  async resetPassword(
    @Param("id") id: string,
    @Body("newPassword") newPassword: string,
  ) {
    const tenantId = this.db.tenantId!;
    return this.users.resetPassword(id, tenantId, newPassword);
  }
}
