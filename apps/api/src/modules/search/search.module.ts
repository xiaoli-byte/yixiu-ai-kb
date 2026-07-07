import { Module } from "@nestjs/common";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";
import { EmbeddingsModule } from "../embeddings/embeddings.module";
import { DocumentAccessService } from "../documents/document-access.service";

@Module({
  imports: [EmbeddingsModule],
  controllers: [SearchController],
  providers: [SearchService, DocumentAccessService],
  exports: [SearchService],
})
export class SearchModule {}
