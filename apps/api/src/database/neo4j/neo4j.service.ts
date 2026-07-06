import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import neo4j, { Driver, Session, Result } from "neo4j-driver";

export const NEO4J_DRIVER = "NEO4J_DRIVER";

@Injectable()
export class Neo4jService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Neo4jService.name);

  constructor(@Inject(NEO4J_DRIVER) public readonly driver: Driver) {}

  async onModuleInit() {
    await this.runConstraints();
  }

  async onModuleDestroy() {
    await this.driver.close();
  }

  getSession(): Session {
    return this.driver.session({ defaultAccessMode: neo4j.session.WRITE });
  }

  async run(cypher: string, params: Record<string, any> = {}): Promise<Result> {
    const session = this.getSession();
    try {
      return await session.run(cypher, params);
    } finally {
      await session.close();
    }
  }

  async runRead(cypher: string, params: Record<string, any> = {}) {
    const session = this.driver.session({ defaultAccessMode: neo4j.session.READ });
    try {
      return await session.run(cypher, params);
    } finally {
      await session.close();
    }
  }

  private async runConstraints() {
    const statements = [
      "CREATE CONSTRAINT doc_id IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE",
      "CREATE CONSTRAINT chunk_id IF NOT EXISTS FOR (c:Chunk) REQUIRE c.id IS UNIQUE",
      "CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE",
      "CREATE CONSTRAINT tag_id IF NOT EXISTS FOR (t:Tag) REQUIRE t.id IS UNIQUE",
      "CREATE INDEX entity_name IF NOT EXISTS FOR (e:Entity) ON (e.name)",
      "CREATE INDEX entity_canonical_key IF NOT EXISTS FOR (e:Entity) ON (e.canonicalKey)",
      "CREATE INDEX entity_type IF NOT EXISTS FOR (e:Entity) ON (e.type)",
      "CREATE INDEX doc_tenant IF NOT EXISTS FOR (d:Document) ON (d.tenantId)",
      "CREATE INDEX doc_content_hash IF NOT EXISTS FOR (d:Document) ON (d.contentHash)",
      "CREATE INDEX chunk_doc IF NOT EXISTS FOR (c:Chunk) ON (c.documentId)",
      "CREATE INDEX rel_edge_key IF NOT EXISTS FOR ()-[r:RELATES_TO]-() ON (r.edgeKey)",
    ];
    for (const stmt of statements) {
      try {
        await this.run(stmt);
      } catch (e: any) {
        this.logger.warn(`约束执行失败（可忽略）: ${e.message}`);
      }
    }
    this.logger.log("Neo4j 约束初始化完成");
  }
}
