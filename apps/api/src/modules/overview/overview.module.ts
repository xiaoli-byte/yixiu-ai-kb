import { Module } from "@nestjs/common";
import { OverviewController } from "./overview.controller";
import { OverviewService } from "./overview.service";
import { PermissionsModule } from "../../common/permissions/permissions.module";

@Module({
  imports: [PermissionsModule],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
