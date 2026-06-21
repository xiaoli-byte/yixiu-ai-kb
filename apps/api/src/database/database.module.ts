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
        new Pool({ connectionString: config.get<string>("DATABASE_URL"), max: 20 }),
    },
    {
      provide: PRISMA,
      useFactory: () => new PrismaClient({ log: ["error", "warn"] }),
    },
    DatabaseService,
  ],
  exports: [DatabaseService, PG_POOL, PRISMA],
})
export class DatabaseModule {}