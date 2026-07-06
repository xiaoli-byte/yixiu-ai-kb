import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { ClsModule } from "nestjs-cls";

import { DatabaseModule } from "./database/database.module";
import { Neo4jModule } from "./database/neo4j/neo4j.module";
import { QueueModule } from "./modules/queue/queue.module";
import { RateLimitModule } from "./common/rate-limit/rate-limit.module";
import { PermissionsModule } from "./common/permissions/permissions.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { DepartmentsModule } from "./modules/departments/departments.module";
import { FoldersModule } from "./modules/folders/folders.module";
import { TagsModule } from "./modules/tags/tags.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { SearchModule } from "./modules/search/search.module";
import { QaModule } from "./modules/qa/qa.module";
import { GraphModule } from "./modules/graph/graph.module";
import { EmbeddingsModule } from "./modules/embeddings/embeddings.module";
import { LlmModule } from "./modules/llm/llm.module";
import { StorageModule } from "./modules/storage/storage.module";
import { HealthController } from "./common/health.controller";
import { loadRootEnv, validateEnv } from "./config/env";

loadRootEnv();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL,
        transport:
          process.env.NODE_ENV === "production"
            ? undefined
            : { target: "pino-pretty", options: { singleLine: true, colorize: true } },
        customProps: () => ({ context: "HTTP" }),
        genReqId: (req) =>
          (req.headers["x-correlation-id"] as string) ||
          `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    }),
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),

    DatabaseModule,
    Neo4jModule,
    QueueModule,
    RateLimitModule,
    PermissionsModule,
    StorageModule,
    EmbeddingsModule,
    LlmModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    FoldersModule,
    TagsModule,
    DocumentsModule,
    SearchModule,
    QaModule,
    GraphModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
