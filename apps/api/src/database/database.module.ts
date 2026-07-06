import { Global, Module } from "@nestjs/common";
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PG_POOL, PRISMA } from "./database.service";
import { DatabaseService } from "./database.service";
import { AppConfigService } from "../config/app-config.service";

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new Pool({ connectionString: config.database.url, max: 20 }),
    },
    {
      provide: PRISMA,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new PrismaClient({
          datasources: { db: { url: config.database.url } },
          log: ["error", "warn"],
        }),
    },
    DatabaseService,
  ],
  exports: [DatabaseService, PG_POOL, PRISMA],
})
export class DatabaseModule {}
