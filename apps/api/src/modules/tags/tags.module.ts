import { Module } from "@nestjs/common";
import { TagsController } from "./tags.controller";
import { TagsService } from "./tags.service";
import { PermissionsModule } from "../../common/permissions/permissions.module";
import { DocumentAccessService } from "../documents/document-access.service";

@Module({
  imports: [PermissionsModule],
  controllers: [TagsController],
  providers: [TagsService, DocumentAccessService],
  exports: [TagsService],
})
export class TagsModule {}
