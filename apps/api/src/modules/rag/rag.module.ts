import { Module } from "@nestjs/common";
import { LlmModule } from "../llm/llm.module";
import { RagFactExtractionService } from "./rag-fact-extraction.service";
import { RagFactsService } from "./rag-facts.service";
import { RagProfileService } from "./rag-profile.service";
import { RagRouterService } from "./rag-router.service";
import { RagToolsService } from "./rag-tools.service";

@Module({
  imports: [LlmModule],
  providers: [
    RagProfileService,
    RagRouterService,
    RagFactsService,
    RagFactExtractionService,
    RagToolsService,
  ],
  exports: [
    RagProfileService,
    RagRouterService,
    RagFactsService,
    RagFactExtractionService,
    RagToolsService,
  ],
})
export class RagModule {}
