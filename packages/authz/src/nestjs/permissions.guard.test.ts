import { ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { PermissionsGuard } from "./permissions.guard.js";
import { buildPermission } from "../core/permission.js";
import type { AuthClaims } from "../core/claims.js";
import type { AuthzOptions } from "./types.js";

const READ = buildPermission("kb", "document", "read");
const MANAGE = buildPermission("kb", "document", "manage");

function makeContext(required: string[] | undefined, user?: AuthClaims): ExecutionContext {
  const request = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
    __required: required,
  } as unknown as ExecutionContext;
}

function makeGuard(required: string[] | undefined, options: AuthzOptions) {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  return new PermissionsGuard(reflector, options);
}

const options: AuthzOptions = {
  accessSecret: "secret",
  rolePermissionMap: { editor: [READ] },
};

describe("PermissionsGuard", () => {
  it("allows when no permissions are required", () => {
    const guard = makeGuard(undefined, options);
    const context = makeContext(undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it("403s when there is no authenticated user", () => {
    const guard = makeGuard([READ], options);
    const context = makeContext([READ]);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("403s when the user's roles do not grant the required permission", () => {
    const guard = makeGuard([MANAGE], options);
    const user: AuthClaims = { sub: "u1", tenantId: "t1", roles: ["editor"] };
    const context = makeContext([MANAGE], user);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("200s (returns true) when the user has the required permission", () => {
    const guard = makeGuard([READ], options);
    const user: AuthClaims = { sub: "u1", tenantId: "t1", roles: ["editor"] };
    const context = makeContext([READ], user);
    expect(guard.canActivate(context)).toBe(true);
  });

  it("supports a hot-reloadable rolePermissionMap function", () => {
    const dynamicOptions: AuthzOptions = {
      accessSecret: "secret",
      rolePermissionMap: () => ({ editor: [READ] }),
    };
    const guard = makeGuard([READ], dynamicOptions);
    const user: AuthClaims = { sub: "u1", tenantId: "t1", roles: ["editor"] };
    const context = makeContext([READ], user);
    expect(guard.canActivate(context)).toBe(true);
  });
});
