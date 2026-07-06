import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { ClsService } from "nestjs-cls";

export const PG_POOL = "PG_POOL";
export const PRISMA = "PRISMA";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(PG_POOL) public readonly pool: Pool,
    @Inject(PRISMA) public readonly prisma: PrismaClient,
    private readonly cls: ClsService,
  ) {}

  async onModuleInit() {
    await this.prisma.$connect();
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
    await this.pool.end();
  }

  /** 当前请求的 tenantId（来自 CLS） */
  get tenantId(): string | undefined {
    return this.cls.get("tenantId");
  }

  /** 当前请求的用户 ID（来自 CLS） */
  get userId(): string | undefined {
    return this.cls.get("userId");
  }

  /** 当前请求的用户角色（来自 CLS） */
  get role(): string | undefined {
    return this.cls.get("role");
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const res = await this.pool.query(sql, params);
    return res.rows as T[];
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }
}
