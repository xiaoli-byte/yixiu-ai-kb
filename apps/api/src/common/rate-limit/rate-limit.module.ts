import { Global, Module } from "@nestjs/common";
import { RateLimitService } from "./rate-limit.service";
import { RateLimitGuard } from "./rate-limit.guard";
import { QueueModule } from "../../modules/queue/queue.module";

@Global()
@Module({
  imports: [QueueModule],
  providers: [RateLimitService, RateLimitGuard],
  exports: [RateLimitService, RateLimitGuard],
})
export class RateLimitModule {}
