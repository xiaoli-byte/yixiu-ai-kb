import { Module } from "@nestjs/common";
import { SearchController } from "./search.controller";
import { SearchRetrieveController } from "./search-retrieve.controller";
import { SearchService } from "./search.service";
import { EmbeddingsModule } from "../embeddings/embeddings.module";
import { DocumentAccessService } from "../documents/document-access.service";
import { PermissionsModule } from "../../common/permissions/permissions.module";

@Module({
  // PermissionsModule:控制器类级 PermissionsGuard 需要注入 PermissionsService
  imports: [EmbeddingsModule, PermissionsModule],
  controllers: [SearchController, SearchRetrieveController],
  providers: [SearchService, DocumentAccessService],
  exports: [SearchService],
})
export class SearchModule {}
