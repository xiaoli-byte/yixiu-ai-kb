import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ClsService } from "nestjs-cls";
// NOTE: this package is bundled with esbuild (tsup), which does not emit
// TypeScript's `emitDecoratorMetadata` (`design:paramtypes`) output. Nest's
// implicit type-based constructor injection relies on that metadata, so every
// param here MUST use an explicit `@Inject(token)` — relying on the bare type
// (as you would in a tsc-compiled Nest app) silently resolves to `undefined`.
import type { Request } from "express";
import { verifyAccessToken } from "../jwt/access-token.js";
import { accessCookieName, type AuthCookieConfig } from "../jwt/cookies.js";
import type { AuthClaims } from "../core/claims.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";
import { AUTHZ_OPTIONS } from "./tokens.js";
import type { AuthzOptions } from "./types.js";

/**
 * Reads the access token from the cookie configured in `AuthzOptions.cookies`, verifies
 * it, and writes `userId`/`tenantId`/`roles` into CLS (nestjs-cls) so the rest of the
 * request — including the host's own Prisma tenant-scoping layer, see CALL-03/KB-01 —
 * can read them without re-parsing the token.
 *
 * Does NOT register its own `ClsModule` — the host app must already provide a global
 * `ClsService` (see AuthzModule.forRoot's doc comment).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ClsService) private readonly cls: ClsService,
    @Inject(AUTHZ_OPTIONS) private readonly options: AuthzOptions,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request & { user?: AuthClaims }>();
    const cookieConfig: AuthCookieConfig = {
      isProd: process.env.NODE_ENV === "production",
      ...this.options.cookies,
    };
    const token = request.cookies?.[accessCookieName(cookieConfig)] as string | undefined;

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException("Missing access token");
    }

    let claims: AuthClaims;
    try {
      claims = verifyAccessToken(
        token,
        this.options.accessTokenVerifyKeys ?? { secret: this.options.accessSecret },
      );
    } catch {
      if (isPublic) return true;
      throw new UnauthorizedException("Invalid or expired access token");
    }

    request.user = claims;
    this.cls.set("userId", claims.sub);
    this.cls.set("tenantId", claims.tenantId);
    this.cls.set("roles", claims.roles);

    return true;
  }
}
