import { UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import { signAccessToken } from "../jwt/access-token.js";
import type { AuthzOptions } from "./types.js";

const SECRET = "test-secret";

function makeContext(cookies: Record<string, string>): {
  context: ExecutionContext;
  request: { cookies: Record<string, string>; user?: unknown };
} {
  const request: { cookies: Record<string, string>; user?: unknown } = { cookies };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return { context, request };
}

function makeGuard(isPublic: boolean, options: AuthzOptions) {
  const reflector = { getAllAndOverride: () => isPublic } as unknown as Reflector;
  const cls = { set: vi.fn() } as unknown as import("nestjs-cls").ClsService;
  return { guard: new JwtAuthGuard(reflector, cls, options), cls };
}

const options: AuthzOptions = {
  accessSecret: SECRET,
  rolePermissionMap: {},
};

describe("JwtAuthGuard", () => {
  it("401s a private route with no cookie", () => {
    const { guard } = makeGuard(false, options);
    const { context } = makeContext({});
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("401s a private route with an invalid token", () => {
    const { guard } = makeGuard(false, options);
    const { context } = makeContext({ access_token: "not-a-jwt" });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("allows a public route with no cookie, without setting CLS", () => {
    const { guard, cls } = makeGuard(true, options);
    const { context } = makeContext({});
    expect(guard.canActivate(context)).toBe(true);
    expect(cls.set).not.toHaveBeenCalled();
  });

  it("passes a private route with a valid token and populates request.user + CLS", () => {
    const { guard, cls } = makeGuard(false, options);
    const token = signAccessToken(
      { sub: "user-1", tenantId: "tenant-1", roles: ["viewer"] },
      { secret: SECRET, ttl: "15m" },
    );
    const { context, request } = makeContext({ access_token: token });

    expect(guard.canActivate(context)).toBe(true);
    expect(request.user).toEqual({
      sub: "user-1",
      tenantId: "tenant-1",
      roles: ["viewer"],
      email: undefined,
    });
    expect(cls.set).toHaveBeenCalledWith("userId", "user-1");
    expect(cls.set).toHaveBeenCalledWith("tenantId", "tenant-1");
    expect(cls.set).toHaveBeenCalledWith("roles", ["viewer"]);
  });
});
