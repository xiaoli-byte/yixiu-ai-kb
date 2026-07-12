import { Global, Module } from "@nestjs/common";
import { Queue, Worker, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { QueueService } from "./queue.service";
import { DocumentProcessor } from "./document.processor";
import { DocumentsModule } from "../documents/documents.module";
import { AppConfigService } from "../../config/app-config.service";

@Global()
@Module({
  imports: [DocumentsModule],
  providers: [
    {
      provide: "REDIS",
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new IORedis(config.redis.url, {
          maxRetriesPerRequest: null,
        }),
    },
    QueueService,
    DocumentProcessor,
  ],
  exports: [QueueService, "REDIS"],
})
export class QueueModule {}
