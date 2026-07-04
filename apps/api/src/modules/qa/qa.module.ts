import { Module } from "@nestjs/common";
import { QaController } from "./qa.controller";
import { QaService } from "./qa.service";
import { SearchModule } from "../search/search.module";
import { StorageModule } from "../storage/storage.module";
import { LlmModule } from "../llm/llm.module";
import { RagModule } from "../rag/rag.module";

@Module({
  imports: [SearchModule, StorageModule, LlmModule, RagModule],
  controllers: [QaController],
  providers: [QaService],
  exports: [QaService],
})
export class QaModule {}
