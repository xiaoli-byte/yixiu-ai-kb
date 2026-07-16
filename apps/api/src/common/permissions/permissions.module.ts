import { Module } from "@nestjs/common";
import { PermissionsService } from "./permissions.service";
import { PermissionsGuard } from "./permissions.guard";
import { PermissionsController } from "./permissions.controller";
import { RolesManagementService } from "./roles-management.service";

@Module({
  // 历史缺陷：本模块曾只注册 providers 不注册 controllers，/api/permissions/*
  // 全部路由从未挂载（404），控制器里的半成品桩因此长期无人发现。
  controllers: [PermissionsController],
  providers: [PermissionsService, PermissionsGuard, RolesManagementService],
  exports: [PermissionsService, PermissionsGuard],
})
export class PermissionsModule {}
