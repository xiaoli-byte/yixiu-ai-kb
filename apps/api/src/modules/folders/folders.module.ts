import { Module } from "@nestjs/common";
import { FoldersController } from "./folders.controller";
import { FoldersService } from "./folders.service";
import { PermissionsModule } from "../../common/permissions/permissions.module";

@Module({
  imports: [PermissionsModule],
  controllers: [FoldersController],
  providers: [FoldersService],
  exports: [FoldersService],
})
export class FoldersModule {}
