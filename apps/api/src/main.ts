import "reflect-metadata";
import { loadRootEnv } from "./config/env";

loadRootEnv();

import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { Logger as PinoLogger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { AppConfigService } from "./config/app-config.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  const appConfig = app.get(AppConfigService);
  const { apiPort, webOrigin, isProduction } = appConfig.server;
  const corsOrigins =
    isProduction
      ? [webOrigin]
      : [webOrigin, "http://localhost:8888"];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.setGlobalPrefix("api", { exclude: ["health"] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: false,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  await app.listen(apiPort, "0.0.0.0");
  Logger.log(`API running on http://localhost:${apiPort}/api`, "Bootstrap");
}
bootstrap().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("Bootstrap failed", e);
  process.exit(1);
});
