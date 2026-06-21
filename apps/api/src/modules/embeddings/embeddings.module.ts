import { Global, Module } from "@nestjs/common";
import { EmbeddingsService } from "./embeddings.service";
import { TextChunkerService } from "./text-chunker.service";

@Global()
@Module({
  providers: [EmbeddingsService, TextChunkerService],
  exports: [EmbeddingsService, TextChunkerService],
})
export class EmbeddingsModule {}
