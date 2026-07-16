import { Client as MinioClient } from "minio";
import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import type { Readable } from "node:stream";
import { AppConfigService } from "../../config/app-config.service";

const STORAGE_OPERATION_TIMEOUT_MS = 15_000;

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: MinioClient;
  private bucket!: string;

  constructor(private readonly config: AppConfigService) {}

  onModuleInit() {
    const storage = this.config.storage;

    this.bucket = storage.bucket;

    this.client = new MinioClient({
      endPoint: storage.endPoint,
      port: storage.port,
      useSSL: storage.useSSL,
      accessKey: storage.accessKey,
      secretKey: storage.secretKey,
    });
    this.ensureBucket().catch((e) =>
      this.logger.warn(`MinIO 初始化失败（容器可能未启动）: ${e.message}`),
    );
  }

  private async ensureBucket() {
    const exists = await this.withTimeout(
      this.client.bucketExists(this.bucket),
      "检查 MinIO bucket",
    ).catch(() => false);
    if (!exists) {
      await this.withTimeout(
        this.client.makeBucket(this.bucket, this.config.storage.region),
        "创建 MinIO bucket",
      );
      this.logger.log(`Bucket '${this.bucket}' 已创建`);
    }
  }

  async putObject(key: string, buffer: Buffer, mime: string): Promise<void> {
    await this.withTimeout(
      this.client.putObject(this.bucket, key, buffer, buffer.length, {
        "Content-Type": mime,
      }),
      "上传文件到 MinIO",
    );
  }

  async getObject(key: string): Promise<Buffer> {
    const stream = await this.withTimeout(this.client.getObject(this.bucket, key), "读取 MinIO 文件");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  }

  async getObjectStream(key: string): Promise<Readable> {
    return this.withTimeout(this.client.getObject(this.bucket, key), "Read MinIO file");
  }

  async removeObject(key: string): Promise<void> {
    await this.withTimeout(this.client.removeObject(this.bucket, key), "删除 MinIO 文件");
  }

  private async withTimeout<T>(operation: Promise<T>, action: string): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`${action} 超时，请确认 MinIO 服务可用`)),
            STORAGE_OPERATION_TIMEOUT_MS,
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
