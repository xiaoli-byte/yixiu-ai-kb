import { Controller, Get } from "@nestjs/common";
import { Public } from "./decorators/public.decorator";

@Public()
@Controller("health")
export class HealthController {
  @Get()
  check() {
    return { ok: true, ts: new Date().toISOString() };
  }
}