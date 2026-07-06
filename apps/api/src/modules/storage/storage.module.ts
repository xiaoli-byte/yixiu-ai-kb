import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { StorageService } from "./storage.service";

@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new StorageService(config),
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
