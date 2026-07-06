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
        const uri = config.getOrThrow<string>("NEO4J_URI");
        const user = config.getOrThrow<string>("NEO4J_USER");
        const password = config.getOrThrow<string>("NEO4J_PASSWORD");
        const auth = neo4j.auth.basic(user, password);
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
