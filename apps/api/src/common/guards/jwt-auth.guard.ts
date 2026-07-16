import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

/**
 * 全局 JWT 守卫（app.module 以 APP_GUARD 注册）。
 *
 * 默认拒绝策略的第一层：所有路由先过 JWT 验签，@Public 标记的路由跳过。
 * 之前鉴权靠每个 controller 手工挂 @UseGuards(AuthGuard("jwt"))，
 * 漏挂即裸奔——全局注册后"忘了挂"在结构上不可能发生。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
