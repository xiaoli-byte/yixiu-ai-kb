import "reflect-metadata";
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
// 鏄惧紡浠庨」鐩牴鍔犺浇 .env锛堜笉渚濊禆 cwd锛?
loadEnv({ path: resolve(__dirname, "../../../.env") });

import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { Logger as PinoLogger } from "nestjs-pino";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  const webOrigin = process.env.WEB_ORIGIN || "http://localhost:8888";
  app.enableCors({
    origin: [webOrigin, "http://localhost:8888"],
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

  const port = Number(process.env.API_PORT || 9999);
  await app.listen(port, "0.0.0.0");
  Logger.log(`API running on http://localhost:${port}/api`, "Bootstrap");
}
bootstrap().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("Bootstrap failed", e);
  process.exit(1);
});
