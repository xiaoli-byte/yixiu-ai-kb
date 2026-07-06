import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const DOCUMENT_QUEUE = "document-processing";
const QUEUE_OPERATION_TIMEOUT_MS = 5_000;

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
    if (this.redis.status !== "ready") {
      throw new ServiceUnavailableException(
        `文档处理任务入队失败：Redis 当前状态为 ${this.redis.status}`,
      );
    }

    return this.withTimeout(
      this.documentQueue.add("process", payload, { jobId: `doc-${payload.documentId}` }),
      "文档处理任务入队",
    );
  }

  get queue() {
    return this.documentQueue;
  }

  private async withTimeout<T>(operation: Promise<T>, action: string): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`${action} 超时，请确认 Redis 服务可用`)),
            QUEUE_OPERATION_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (error: any) {
      throw new ServiceUnavailableException(error?.message || `${action} 失败`);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
