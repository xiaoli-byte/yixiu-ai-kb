import { Module } from "@nestjs/common";
import { QaController } from "./qa.controller";
import { QaService } from "./qa.service";
import { SearchModule } from "../search/search.module";
import { StorageModule } from "../storage/storage.module";
import { LlmModule } from "../llm/llm.module";
import { RagModule } from "../rag/rag.module";
import { DocumentAccessService } from "../documents/document-access.service";

@Module({
  imports: [SearchModule, StorageModule, LlmModule, RagModule],
  controllers: [QaController],
  providers: [QaService, DocumentAccessService],
  exports: [QaService],
})
export class QaModule {}
