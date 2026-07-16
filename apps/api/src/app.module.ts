import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
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
import { DocumentsModule } from "./modules/documents/documents.module";
import { SearchModule } from "./modules/search/search.module";
import { QaModule } from "./modules/qa/qa.module";
import { GraphModule } from "./modules/graph/graph.module";
import { OverviewModule } from "./modules/overview/overview.module";
import { EmbeddingsModule } from "./modules/embeddings/embeddings.module";
import { LlmModule } from "./modules/llm/llm.module";
import { StorageModule } from "./modules/storage/storage.module";
import { HealthController } from "./common/health.controller";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { PermissionsGuard } from "./common/permissions/permissions.guard";
import { loadRootEnv, validateEnv } from "./config/env";
import { AppConfigModule } from "./config/app-config.module";
import { AppConfigService } from "./config/app-config.service";

loadRootEnv();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    AppConfigModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (appConfig: AppConfigService) => ({
        pinoHttp: {
          level: appConfig.server.logLevel,
          transport: appConfig.isProduction
            ? undefined
            : { target: "pino-pretty", options: { singleLine: true, colorize: true } },
          customProps: () => ({ context: "HTTP" }),
          genReqId: (req) =>
            (req.headers["x-correlation-id"] as string) ||
            `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        },
      }),
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
    DocumentsModule,
    SearchModule,
    QaModule,
    GraphModule,
    OverviewModule,
  ],
  controllers: [HealthController],
  providers: [
    // 全局默认拒绝：先 JWT 验签（@Public 跳过），再权限声明检查（无声明→403）。
    // 注册顺序即执行顺序，勿调换。
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
