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

  constructor() {}

  onModuleInit() {
    const config = new ConfigService();
    const endPoint = config.get<string>("MINIO_ENDPOINT") || "localhost";
    const port = Number(config.get<string>("MINIO_PORT") || 9000);

    this.bucket = config.get<string>("S3_BUCKET") || "ai-knowledge-docs";
    this.publicUrl = config.get<string>("MINIO_PUBLIC_URL") || "http://localhost:9000";
    this.internalUrl = `http://${endPoint}:${port}`;

    this.client = new MinioClient({
      endPoint,
      port,
      useSSL: false,
      accessKey: config.get<string>("S3_ACCESS_KEY") || "minio_admin",
      secretKey: config.get<string>("S3_SECRET_KEY") || "minio_password",
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
    const signedUrl = await this.client.presignedGetObject(
      this.bucket,
      key,
      expirySeconds,
    );
    // 将内部 MinIO 地址替换为外部可访问的公共地址
    return signedUrl.replace(this.internalUrl, this.publicUrl);
  }

  get publicBaseUrl() {
    return `${this.publicUrl}/${this.bucket}`;
  }
}