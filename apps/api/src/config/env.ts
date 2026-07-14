import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const REQUIRED_IN_ALL_ENVS = [
  "API_PORT",
  "WEB_ORIGIN",
  "LOG_LEVEL",
  "APP_TIME_ZONE",
  "DATABASE_URL",
  "REDIS_URL",
  "MINIO_ENDPOINT",
  "MINIO_PORT",
  "MINIO_PUBLIC_URL",
  "S3_BUCKET",
  "S3_REGION",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
  "NEO4J_URI",
  "NEO4J_USER",
  "NEO4J_PASSWORD",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "JWT_ACCESS_TTL",
  "JWT_REFRESH_TTL",
  "BOOTSTRAP_ADMIN_EMAIL",
  "BOOTSTRAP_ADMIN_PASSWORD",
  "BOOTSTRAP_ADMIN_NAME",
  "BOOTSTRAP_TENANT_ID",
  "DASHSCOPE_BASE_URL",
  "DASHSCOPE_LLM_MODEL",
  "DASHSCOPE_EMBED_MODEL",
  "DASHSCOPE_EMBED_DIM",
  "DASHSCOPE_LLM_MOCK",
  "DASHSCOPE_EMBED_MOCK",
  "SEARCH_BM25_TOPK",
  "SEARCH_VECTOR_TOPK",
  "SEARCH_RRF_K",
  "SEARCH_RRF_FINAL_TOPK",
  "CHUNK_SIZE",
  "CHUNK_OVERLAP",
  "EMBED_BATCH_SIZE",
  "FUNASR_HTTP_URL",
  "FUNASR_TIMEOUT_MS",
  "PADDLEOCR_HTTP_URL",
  "PADDLEOCR_TIMEOUT_MS",
  "PADDLEOCR_UPLOAD_FIELD",
  "PADDLEOCR_LANG",
  "PADDLEOCR_LANG_FIELD",
  "OCR_PDF_RENDER_SCALE",
  "OCR_PDF_MAX_PAGES",
  "DOCUMENT_UPLOAD_MAX_MB",
  "DOCUMENT_WORKER_ENABLED",
  "DOCUMENT_WORKER_CONCURRENCY",
] as const;

const PRODUCTION_SECRET_KEYS = [
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "S3_SECRET_KEY",
  "NEO4J_PASSWORD",
] as const;

const PRODUCTION_REAL_VALUE_KEYS = [
  "DATABASE_URL",
  "BOOTSTRAP_ADMIN_PASSWORD",
  ...PRODUCTION_SECRET_KEYS,
] as const;

const PLACEHOLDER_VALUES = new Set([
  "admin_password",
  "minio_password",
  "minio_secret_key",
  "neo4j_password",
  "neo4j_secure_password",
  "password",
]);

const nonEmpty = z.string().trim().min(1);
const numeric = z.string().regex(/^\d+$/, "must be numeric");
const decimal = z.string().regex(/^\d+(\.\d+)?$/, "must be numeric");
const boolString = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.enum(["true", "false", "1", "0", "yes", "no", "on", "off"]));

const envShape = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: numeric,
    WEB_PORT: numeric.optional(),
    WEB_ORIGIN: nonEmpty,
    LOG_LEVEL: nonEmpty,
    API_INTERNAL_URL: nonEmpty.optional(),
    NEXT_PUBLIC_API_URL: nonEmpty.optional(),
    NEXT_PUBLIC_DEMO_MODE: boolString.optional(),
    NEXT_PUBLIC_DEMO_EMAIL: nonEmpty.optional(),
    NEXT_PUBLIC_DEMO_PASSWORD: nonEmpty.optional(),
    APP_TIME_ZONE: nonEmpty,
    DATABASE_URL: nonEmpty,
    POSTGRES_USER: nonEmpty.optional(),
    POSTGRES_PASSWORD: nonEmpty.optional(),
    POSTGRES_DB: nonEmpty.optional(),
    POSTGRES_PORT: numeric.optional(),
    REDIS_URL: nonEmpty,
    REDIS_PORT: numeric.optional(),
    MINIO_ROOT_USER: nonEmpty.optional(),
    MINIO_ROOT_PASSWORD: nonEmpty.optional(),
    MINIO_ENDPOINT: nonEmpty,
    MINIO_PUBLIC_URL: nonEmpty,
    MINIO_PORT: numeric,
    MINIO_CONSOLE_PORT: numeric.optional(),
    S3_REGION: nonEmpty,
    S3_BUCKET: nonEmpty,
    S3_ACCESS_KEY: nonEmpty,
    S3_SECRET_KEY: nonEmpty,
    NEO4J_URI: nonEmpty,
    NEO4J_HTTP_URL: nonEmpty.optional(),
    NEO4J_USER: nonEmpty,
    NEO4J_PASSWORD: nonEmpty,
    NEO4J_HTTP_PORT: numeric.optional(),
    NEO4J_BOLT_PORT: numeric.optional(),
    JWT_ACCESS_SECRET: nonEmpty,
    JWT_REFRESH_SECRET: nonEmpty,
    JWT_ACCESS_TTL: nonEmpty,
    JWT_REFRESH_TTL: nonEmpty,
    // 联合登录 / 服务间调用（CALL-13）：全部可选，且运行时代码把空串按未设置处理
    // （jwt.strategy / @xiaoli-byte/authz service-auth.guard 直接读 process.env），
    // 因此这里只做注册不做 min(1)，避免 compose 透传空串导致启动失败。
    FEDERATED_TENANT_ALLOWLIST: z.string().optional(),
    SERVICE_API_TOKEN: z.string().optional(),
    SERVICE_API_REQUIRE_SIGNATURE: z.string().optional(),
    SERVICE_API_SIGNING_SECRET: z.string().optional(),
    SERVICE_API_SIGNATURE_TOLERANCE_MS: z.string().optional(),
    BOOTSTRAP_ADMIN_EMAIL: nonEmpty,
    BOOTSTRAP_ADMIN_PASSWORD: nonEmpty,
    BOOTSTRAP_ADMIN_NAME: nonEmpty,
    BOOTSTRAP_TENANT_ID: nonEmpty,
    DASHSCOPE_API_KEY: z.string().optional(),
    DASHSCOPE_BASE_URL: nonEmpty,
    DASHSCOPE_LLM_MODEL: nonEmpty,
    DASHSCOPE_EMBED_MODEL: nonEmpty,
    DASHSCOPE_EMBED_DIM: numeric,
    DASHSCOPE_LLM_MOCK: boolString,
    DASHSCOPE_EMBED_MOCK: boolString,
    DASHSCOPE_RERANK_MODEL: nonEmpty.optional(),
    DASHSCOPE_RERANK_MOCK: boolString.optional(),
    SEARCH_BM25_TOPK: numeric,
    SEARCH_VECTOR_TOPK: numeric,
    SEARCH_RRF_K: numeric,
    SEARCH_RRF_FINAL_TOPK: numeric,
    CHUNK_SIZE: numeric,
    CHUNK_OVERLAP: numeric,
    EMBED_BATCH_SIZE: numeric,
    FUNASR_HTTP_URL: nonEmpty,
    FUNASR_TIMEOUT_MS: numeric,
    PADDLEOCR_HTTP_URL: nonEmpty,
    PADDLEOCR_PORT: numeric.optional(),
    PADDLEOCR_LANG: nonEmpty,
    PADDLEOCR_UPLOAD_FIELD: nonEmpty,
    PADDLEOCR_LANG_FIELD: nonEmpty,
    PADDLEOCR_TIMEOUT_MS: numeric,
    PADDLEOCR_USE_ANGLE_CLS: boolString.optional(),
    OCR_PDF_RENDER_SCALE: decimal,
    OCR_PDF_MAX_PAGES: numeric,
    DOCUMENT_UPLOAD_MAX_MB: numeric,
    DOCUMENT_WORKER_ENABLED: boolString,
    DOCUMENT_WORKER_CONCURRENCY: numeric,
  })
  .passthrough();

export type AppEnv = z.infer<typeof envShape>;

export function projectRootDir() {
  return resolve(__dirname, "../../../..");
}

export function rootEnvPath() {
  return resolve(projectRootDir(), ".env");
}

function envRulesPath() {
  return resolve(projectRootDir(), "config/env-rules.json");
}

export function loadRootEnv() {
  const base = rootEnvPath();
  const local = resolve(projectRootDir(), ".env.local");
  if (existsSync(base)) loadDotenv({ path: base, override: false });
  if (process.env.NODE_ENV !== "production" && existsSync(local)) {
    loadDotenv({ path: local, override: true });
  }
}

function isPlaceholder(value: string | undefined) {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return (
    PLACEHOLDER_VALUES.has(normalized) ||
    normalized.includes(":password@") ||
    normalized.includes("change_me") ||
    normalized.includes("change_this") ||
    normalized.includes("placeholder") ||
    normalized.includes("replace-with") ||
    normalized.includes("replace_with") ||
    normalized.includes("your_") ||
    normalized.includes("demo123") ||
    normalized.includes("dev_")
  );
}

function isTruthy(value: unknown) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function legacyEnvKeys() {
  const rulesPath = envRulesPath();
  if (!existsSync(rulesPath)) return [] as string[];
  const rules = JSON.parse(readFileSync(rulesPath, "utf8")) as {
    legacyEnvKeys?: string[];
  };
  return rules.legacyEnvKeys || [];
}

export function validateEnv(config: Record<string, unknown>) {
  const result = envShape.safeParse(config);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const env = result.data;
  const legacyKeys = legacyEnvKeys().filter((key) => {
    const value = config[key];
    return value !== undefined && String(value).trim() !== "";
  });
  if (legacyKeys.length > 0) {
    throw new Error(
      `Legacy environment variable(s) are no longer supported: ${legacyKeys.join(", ")}`,
    );
  }

  for (const key of REQUIRED_IN_ALL_ENVS) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  if (env.NODE_ENV === "production") {
    const llmMock = isTruthy(env.DASHSCOPE_LLM_MOCK);
    const embedMock = isTruthy(env.DASHSCOPE_EMBED_MOCK);
    if ((!llmMock || !embedMock) && isPlaceholder(env.DASHSCOPE_API_KEY)) {
      throw new Error(
        "DASHSCOPE_API_KEY is required in production unless both DASHSCOPE_LLM_MOCK and DASHSCOPE_EMBED_MOCK are true",
      );
    }

    for (const key of PRODUCTION_REAL_VALUE_KEYS) {
      if (isPlaceholder(String(env[key] || ""))) {
        throw new Error(
          `Production environment variable ${key} must be a real production value`,
        );
      }
    }

    if (env.JWT_ACCESS_TTL === "7d") {
      throw new Error("Production JWT_ACCESS_TTL must not use the development value 7d");
    }
  }

  return env;
}
