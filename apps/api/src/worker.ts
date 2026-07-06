import "reflect-metadata";
import { loadRootEnv } from "./config/env";

loadRootEnv();

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Logger as PinoLogger } from "nestjs-pino";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  Logger.log("Document worker running", "WorkerBootstrap");

  const shutdown = async (signal: string) => {
    Logger.log(`Received ${signal}, closing document worker`, "WorkerBootstrap");
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("Worker bootstrap failed", e);
  process.exit(1);
});
