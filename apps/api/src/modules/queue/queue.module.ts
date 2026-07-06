import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { QueueService } from "./queue.service";
import { DocumentProcessor } from "./document.processor";
import { DocumentsModule } from "../documents/documents.module";
import { RagModule } from "../rag/rag.module";

@Global()
@Module({
  imports: [DocumentsModule, RagModule],
  providers: [
    {
      provide: "REDIS",
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new IORedis(config.getOrThrow<string>("REDIS_URL"), {
          maxRetriesPerRequest: null,
        }),
    },
    QueueService,
    DocumentProcessor,
  ],
  exports: [QueueService, "REDIS"],
})
export class QueueModule {}
