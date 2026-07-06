import { Global, Module } from "@nestjs/common";
import neo4j from "neo4j-driver";
import { Neo4jService, NEO4J_DRIVER } from "./neo4j.service";
import { AppConfigService } from "../../config/app-config.service";

@Global()
@Module({
  providers: [
    {
      provide: NEO4J_DRIVER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        const { uri, user, password } = config.neo4j;
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
