import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { QueueService } from "./queue.service";
import { DocumentProcessor } from "./document.processor";
import { DocumentsModule } from "../documents/documents.module";

@Global()
@Module({
  imports: [DocumentsModule],
  providers: [
    {
      provide: "REDIS",
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new IORedis(config.get<string>("REDIS_URL") || "redis://localhost:6379", {
          maxRetriesPerRequest: null,
        }),
    },
    QueueService,
    DocumentProcessor,
  ],
  exports: [QueueService, "REDIS"],
})
export class QueueModule {}