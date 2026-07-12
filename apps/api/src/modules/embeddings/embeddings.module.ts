import { Global, Module } from "@nestjs/common";
import { EmbeddingsService } from "./embeddings.service";
import { RerankService } from "./rerank.service";
import { TextChunkerService } from "./text-chunker.service";

@Global()
@Module({
  providers: [EmbeddingsService, RerankService, TextChunkerService],
  exports: [EmbeddingsService, RerankService, TextChunkerService],
})
export class EmbeddingsModule {}
