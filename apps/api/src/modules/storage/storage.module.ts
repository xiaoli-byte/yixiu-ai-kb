import { Global, Module } from "@nestjs/common";
import { StorageService } from "./storage.service";
import { AppConfigService } from "../../config/app-config.service";

@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => new StorageService(config),
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
