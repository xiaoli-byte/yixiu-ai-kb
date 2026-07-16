import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "./env";

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  private string(key: keyof AppEnv): string {
    return this.config.getOrThrow<string>(key as string).trim();
  }

  private optionalString(key: keyof AppEnv): string {
    return this.config.get<string>(key as string)?.trim() || "";
  }

  private optionalPem(key: keyof AppEnv): string {
    // Container/secret stores commonly provide PEM as a single escaped env value.
    return this.optionalString(key).replace(/\\n/g, "\n");
  }

  private number(key: keyof AppEnv): number {
    return Number(this.string(key));
  }

  private bool(key: keyof AppEnv): boolean {
    return ["1", "true", "yes", "on"].includes(this.string(key).toLowerCase());
  }

  get nodeEnv() {
    return this.string("NODE_ENV");
  }

  get isProduction() {
    return this.nodeEnv === "production";
  }

  get server() {
    return {
      apiPort: this.number("API_PORT"),
      webOrigin: this.string("WEB_ORIGIN"),
      logLevel: this.string("LOG_LEVEL"),
      isProduction: this.isProduction,
    };
  }

  get database() {
    return {
      url: this.string("DATABASE_URL"),
    };
  }

  get redis() {
    return {
      url: this.string("REDIS_URL"),
    };
  }

  get storage() {
    const endPoint = this.string("MINIO_ENDPOINT");
    const port = this.number("MINIO_PORT");
    return {
      endPoint,
      port,
      internalUrl: `http://${endPoint}:${port}`,
      publicUrl: this.string("MINIO_PUBLIC_URL"),
      bucket: this.string("S3_BUCKET"),
      region: this.string("S3_REGION"),
      accessKey: this.string("S3_ACCESS_KEY"),
      secretKey: this.string("S3_SECRET_KEY"),
      useSSL: false,
    };
  }

  get neo4j() {
    return {
      uri: this.string("NEO4J_URI"),
      user: this.string("NEO4J_USER"),
      password: this.string("NEO4J_PASSWORD"),
    };
  }

  get jwt() {
    return {
      accessSecret: this.string("JWT_ACCESS_SECRET"),
      refreshSecret: this.string("JWT_REFRESH_SECRET"),
      accessAlgorithm: this.config.getOrThrow<"HS256" | "RS256">("JWT_ACCESS_ALGORITHM"),
      accessPrivateKey: this.optionalPem("JWT_ACCESS_PRIVATE_KEY"),
      accessPublicKey: this.optionalPem("JWT_ACCESS_PUBLIC_KEY"),
      accessKeyId: this.optionalString("JWT_ACCESS_KEY_ID") || "ai-knowledge-v1",
      federatedAccessPublicKey: this.optionalPem("FEDERATED_JWT_ACCESS_PUBLIC_KEY"),
      federatedAccessKeyId:
        this.optionalString("FEDERATED_JWT_ACCESS_KEY_ID") || "ai-call-v1",
      accessTtl: this.string("JWT_ACCESS_TTL"),
      refreshTtl: this.string("JWT_REFRESH_TTL"),
    };
  }

  get bootstrap() {
    return {
      tenantId: this.string("BOOTSTRAP_TENANT_ID"),
      adminEmail: this.string("BOOTSTRAP_ADMIN_EMAIL"),
      adminPassword: this.string("BOOTSTRAP_ADMIN_PASSWORD"),
      adminName: this.string("BOOTSTRAP_ADMIN_NAME"),
    };
  }

  get dashscope() {
    return {
      apiKey: this.optionalString("DASHSCOPE_API_KEY"),
      baseUrl: this.string("DASHSCOPE_BASE_URL"),
      llmModel: this.string("DASHSCOPE_LLM_MODEL"),
      embedModel: this.string("DASHSCOPE_EMBED_MODEL"),
      embedDim: this.number("DASHSCOPE_EMBED_DIM"),
      llmMock: this.bool("DASHSCOPE_LLM_MOCK"),
      embedMock: this.bool("DASHSCOPE_EMBED_MOCK"),
      rerankModel: this.optionalString("DASHSCOPE_RERANK_MODEL") || "gte-rerank-v2",
      rerankMock: this.optionalString("DASHSCOPE_RERANK_MOCK").toLowerCase() === "true",
    };
  }

  get documentWorker() {
    return {
      enabled: this.string("DOCUMENT_WORKER_ENABLED").toLowerCase() !== "false",
      concurrency: Math.max(1, this.number("DOCUMENT_WORKER_CONCURRENCY")),
      uploadMaxBytes: this.number("DOCUMENT_UPLOAD_MAX_MB") * 1024 * 1024,
    };
  }

  get ocr() {
    return {
      httpUrl: this.string("PADDLEOCR_HTTP_URL"),
      timeoutMs: this.number("PADDLEOCR_TIMEOUT_MS"),
      uploadField: this.string("PADDLEOCR_UPLOAD_FIELD"),
      language: this.string("PADDLEOCR_LANG"),
      languageField: this.string("PADDLEOCR_LANG_FIELD"),
      pdfRenderScale: this.number("OCR_PDF_RENDER_SCALE"),
      pdfMaxPages: this.number("OCR_PDF_MAX_PAGES"),
    };
  }

  get asr() {
    return {
      httpUrl: this.string("FUNASR_HTTP_URL"),
      timeoutMs: this.number("FUNASR_TIMEOUT_MS"),
    };
  }

  get appTimeZone() {
    return this.string("APP_TIME_ZONE");
  }
}
