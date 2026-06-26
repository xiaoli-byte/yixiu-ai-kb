import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import neo4j from "neo4j-driver";
import { Neo4jService, NEO4J_DRIVER } from "./neo4j.service";

@Global()
@Module({
  providers: [
    {
      provide: NEO4J_DRIVER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>("NEO4J_URI") || "bolt://localhost:7687";
        // Neo4j 5.x 关闭认证时，驱动不发送任何 auth token
        const user = config.get<string>("NEO4J_USER") || "";
        const password = config.get<string>("NEO4J_PASSWORD") || "";
        const auth = user || password
          ? neo4j.auth.basic(user, password)
          : neo4j.auth.basic("neo4j", "");
        return neo4j.driver(uri, auth, {
          maxConnectionPoolSize: 50,
        });
      },
    },
    Neo4jService,
  ],
  exports: [Neo4jService],
})
export class Neo4jModule {}