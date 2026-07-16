import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { DepartmentsService } from "./departments.service";
import { DatabaseService } from "../../database/database.service";
import { AdminOnly } from "../../common/permissions/permissions.guard";
import { Resource, Action } from "../../common/permissions/permissions.types";

class CreateDeptDto {
  name!: string;
  parentId?: string;
}

class UpdateDeptDto {
  name?: string;
  parentId?: string;
}

@Controller("departments")
export class DepartmentsController {
  constructor(
    private readonly depts: DepartmentsService,
    private readonly db: DatabaseService,
  ) {}

  @Get()
  @AdminOnly()
  list() {
    return this.depts.list(this.db.tenantId!);
  }

  @Post()
  @AdminOnly()
  create(@Body() dto: CreateDeptDto) {
    return this.depts.create(this.db.tenantId!, dto);
  }

  @Patch(":id")
  @AdminOnly()
  update(@Param("id") id: string, @Body() dto: UpdateDeptDto) {
    return this.depts.update(id, this.db.tenantId!, dto);
  }

  @Delete(":id")
  @AdminOnly()
  remove(@Param("id") id: string) {
    return this.depts.remove(id, this.db.tenantId!);
  }
}
