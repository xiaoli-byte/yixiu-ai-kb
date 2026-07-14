import { Module } from "@nestjs/common";
import { QaController } from "./qa.controller";
import { QaService } from "./qa.service";
import { ConversationMemoryService } from "./conversation-memory.service";
import { QueryPlannerService } from "./query-planner.service";
import { QaRunLogService } from "./qa-run-log.service";
import { SearchModule } from "../search/search.module";
import { StorageModule } from "../storage/storage.module";
import { LlmModule } from "../llm/llm.module";
import { DocumentAccessService } from "../documents/document-access.service";
import { PermissionsModule } from "../../common/permissions/permissions.module";

@Module({
  // PermissionsModule:控制器类级 PermissionsGuard 需要注入 PermissionsService
  imports: [SearchModule, StorageModule, LlmModule, PermissionsModule],
  controllers: [QaController],
  providers: [
    QaService,
    ConversationMemoryService,
    QueryPlannerService,
    QaRunLogService,
    DocumentAccessService,
  ],
  exports: [QaService],
})
export class QaModule {}
