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
        const user = config.get<string>("NEO4J_USER") || "neo4j";
        const password = config.get<string>("NEO4J_PASSWORD") || "neo4j_dev_password";
        return neo4j.driver(uri, neo4j.auth.basic(user, password), {
          maxConnectionPoolSize: 50,
        });
      },
    },
    Neo4jService,
  ],
  exports: [Neo4jService],
})
export class Neo4jModule {}