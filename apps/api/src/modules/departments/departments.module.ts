import { Module } from "@nestjs/common";
import { DepartmentsController } from "./departments.controller";
import { DepartmentsService } from "./departments.service";
import { PermissionsModule } from "../../common/permissions/permissions.module";

@Module({
  imports: [PermissionsModule],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
