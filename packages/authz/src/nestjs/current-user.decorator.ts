import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthClaims } from "../core/claims.js";

/** Reads the claims `JwtAuthGuard` attached to the request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthClaims | undefined => {
    const request = context.switchToHttp().getRequest<{ user?: AuthClaims }>();
    return request.user;
  },
);
