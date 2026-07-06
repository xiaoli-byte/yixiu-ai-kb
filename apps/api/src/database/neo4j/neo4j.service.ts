import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import neo4j, { Driver, Session, Result } from "neo4j-driver";

export const NEO4J_DRIVER = "NEO4J_DRIVER";

@Injectable()
export class Neo4jService implements OnModuleDestroy {
  constructor(@Inject(NEO4J_DRIVER) public readonly driver: Driver) {}

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
}
