import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const DOCUMENT_QUEUE = "document-processing";

export interface DocumentJobPayload {
  documentId: string;
  tenantId: string;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private documentQueue!: Queue<DocumentJobPayload>;

  constructor(@Inject("REDIS") private readonly redis: IORedis) {}

  onModuleInit() {
    this.documentQueue = new Queue<DocumentJobPayload>(DOCUMENT_QUEUE, {
      connection: this.redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    });
    this.logger.log("BullMQ 队列就绪");
  }

  async onModuleDestroy() {
    await this.documentQueue?.close();
  }

  async enqueueDocument(payload: DocumentJobPayload) {
    return this.documentQueue.add("process", payload, { jobId: `doc-${payload.documentId}` });
  }

  get queue() {
    return this.documentQueue;
  }
}