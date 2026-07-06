import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PG_POOL, PRISMA } from "./database.service";
import { DatabaseService } from "./database.service";

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Pool({ connectionString: config.getOrThrow<string>("DATABASE_URL"), max: 20 }),
    },
    {
      provide: PRISMA,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new PrismaClient({
          datasources: { db: { url: config.getOrThrow<string>("DATABASE_URL") } },
          log: ["error", "warn"],
        }),
    },
    DatabaseService,
  ],
  exports: [DatabaseService, PG_POOL, PRISMA],
})
export class DatabaseModule {}
