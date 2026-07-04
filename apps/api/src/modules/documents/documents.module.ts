import { Module } from "@nestjs/common";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { OfficeParserService } from "./office-parser.service";
import { FunAsrService } from "./funasr.service";
import { OcrService } from "./ocr.service";
import { TagsModule } from "../tags/tags.module";
import { PermissionsModule } from "../../common/permissions/permissions.module";

@Module({
  imports: [TagsModule, PermissionsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, OfficeParserService, FunAsrService, OcrService],
  exports: [DocumentsService, OfficeParserService, FunAsrService, OcrService],
})
export class DocumentsModule {}
