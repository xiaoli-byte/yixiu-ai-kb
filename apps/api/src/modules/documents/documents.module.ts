import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { DocumentAccessService } from "./document-access.service";
import { OfficeParserService } from "./office-parser.service";
import { FunAsrService } from "./funasr.service";
import { OcrService } from "./ocr.service";
import { FoldersModule } from "../folders/folders.module";
import { PermissionsModule } from "../../common/permissions/permissions.module";
import { AppConfigService } from "../../config/app-config.service";

@Module({
  imports: [
    FoldersModule,
    PermissionsModule,
    MulterModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        limits: { fileSize: config.documentWorker.uploadMaxBytes },
      }),
    }),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentAccessService, OfficeParserService, FunAsrService, OcrService],
  exports: [DocumentsService, DocumentAccessService, OfficeParserService, FunAsrService, OcrService],
})
export class DocumentsModule {}
