import { Client as MinioClient } from "minio";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: MinioClient;
  private bucket!: string;
  private publicUrl!: string;
  private internalUrl!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const endPoint = this.config.getOrThrow<string>("MINIO_ENDPOINT");
    const port = Number(this.config.getOrThrow<string>("MINIO_PORT"));

    this.bucket = this.config.getOrThrow<string>("S3_BUCKET");
    this.publicUrl = this.config.getOrThrow<string>("MINIO_PUBLIC_URL");
    this.internalUrl = `http://${endPoint}:${port}`;

    this.client = new MinioClient({
      endPoint,
      port,
      useSSL: false,
      accessKey: this.config.getOrThrow<string>("S3_ACCESS_KEY"),
      secretKey: this.config.getOrThrow<string>("S3_SECRET_KEY"),
    });
    this.ensureBucket().catch((e) =>
      this.logger.warn(`MinIO 初始化失败（容器可能未启动）: ${e.message}`),
    );
  }

  private async ensureBucket() {
    const exists = await this.client.bucketExists(this.bucket).catch(() => false);
    if (!exists) {
      await this.client.makeBucket(this.bucket, "us-east-1");
      this.logger.log(`Bucket '${this.bucket}' 已创建`);
    }
  }

  async putObject(key: string, buffer: Buffer, mime: string): Promise<void> {
    await this.client.putObject(this.bucket, key, buffer, buffer.length, {
      "Content-Type": mime,
    });
  }

  async getObject(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  }

  async removeObject(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }

  async presignedGet(key: string, expirySeconds = 3600): Promise<string> {
    // bucket 已设为公开下载，无需签名
    return `/minio/${this.bucket}/${key}`;
  }

  get publicBaseUrl() {
    return `/minio/${this.bucket}`;
  }
}
