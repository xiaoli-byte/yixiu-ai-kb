import {
  ForbiddenException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
// NOTE: see jwt-auth.guard.ts — esbuild (tsup) doesn't emit `design:paramtypes`,
// so every constructor param needs an explicit `@Inject(token)`.
import type { Request } from "express";
import { can } from "../core/can.js";
import type { AuthClaims } from "../core/claims.js";
import type { PermissionKey } from "../core/permission.js";
import { PERMISSIONS_KEY } from "./require-permissions.decorator.js";
import { AUTHZ_OPTIONS } from "./tokens.js";
import type { AuthzOptions } from "./types.js";

/** Functional-level RBAC (judgement layer 3). Runs after `JwtAuthGuard` has populated `request.user`. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AUTHZ_OPTIONS) private readonly options: AuthzOptions,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthClaims }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException("Authentication required");
    }

    const rolePermissionMap =
      typeof this.options.rolePermissionMap === "function"
        ? this.options.rolePermissionMap()
        : this.options.rolePermissionMap;

    if (!can(user, required, rolePermissionMap)) {
      throw new ForbiddenException("Insufficient permissions");
    }
    return true;
  }
}
