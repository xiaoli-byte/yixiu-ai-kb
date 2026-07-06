import { Module } from "@nestjs/common";
import { PermissionsModule } from "../../common/permissions/permissions.module";
import { GraphController } from "./graph.controller";
import { GraphService } from "./graph.service";

@Module({
  imports: [PermissionsModule],
  controllers: [GraphController],
  providers: [GraphService],
  exports: [GraphService],
})
export class GraphModule {}
