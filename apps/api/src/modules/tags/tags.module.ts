import { Module } from "@nestjs/common";
import { TagsController } from "./tags.controller";
import { TagsService } from "./tags.service";
import { PermissionsModule } from "../../common/permissions/permissions.module";

@Module({
  imports: [PermissionsModule],
  controllers: [TagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
