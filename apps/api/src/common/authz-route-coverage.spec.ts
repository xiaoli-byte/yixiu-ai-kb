import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import "reflect-metadata";
import { IS_PUBLIC_KEY } from "./decorators/public.decorator";
import {
  PERMISSIONS_KEY,
  ROLES_KEY,
  MIN_ROLE_KEY,
} from "./permissions/permissions.guard";

/**
 * 路由权限覆盖检查(架构不变量,进 CI):
 *
 * 1. 每条路由必须满足:@Public 或 声明了权限元数据(roles / minRole / permissions,
 *    方法级或类级)。否则全局 PermissionsGuard 会 403——这里在 CI 阶段就把它拦下,
 *    而不是等运行时故障。
 * 2. @Public 路由必须在下方白名单里:新增公开路由是显式安全决策,必须改这份
 *    白名单才能过 CI(棘轮机制)。
 * 3. 服务间端点必须自带 ServiceAuthGuard。
 *
 * Nest 元数据键:@Controller 写 "path",路由方法写 "method"(RequestMethod 枚举),
 * @UseGuards 写 "__guards__"。
 */

/** 公开路由白名单(METHOD 相对路径,不含全局前缀 /api) */
const PUBLIC_ALLOWLIST = new Set([
  "POST auth/login",
  "POST auth/refresh",
  "GET health",
  // 服务间检索端点:@Public 只绕过用户 JWT,ServiceAuthGuard 仍强制(下方单独断言)
  "POST search/retrieve",
  "GET folders/selectable",
  "PUT federation/users/sync",
  "DELETE federation/users/:id",
]);

/** 必须挂 ServiceAuthGuard 的服务间端点 */
const SERVICE_GUARDED = new Set([
  "POST search/retrieve",
  "GET folders/selectable",
  "PUT federation/users/sync",
  "DELETE federation/users/:id",
]);

const REQUEST_METHOD_NAMES = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "ALL",
  "OPTIONS",
  "HEAD",
  "SEARCH",
] as const;

const API_SRC = join(process.cwd(), "apps", "api", "src");

function findControllerFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      out.push(...findControllerFiles(full));
    } else if (entry.name.endsWith(".controller.ts")) {
      out.push(full);
    }
  }
  return out;
}

function normalizePath(...parts: Array<string | undefined>): string {
  return parts
    .filter((p): p is string => Boolean(p))
    .join("/")
    .split("/")
    .filter(Boolean)
    .join("/");
}

interface RouteInfo {
  key: string;
  file: string;
  isPublic: boolean;
  hasDeclaration: boolean;
  guardNames: string[];
}

async function collectRoutes(): Promise<RouteInfo[]> {
  const files = findControllerFiles(API_SRC);
  expect(files.length).toBeGreaterThan(0);

  const routes: RouteInfo[] = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(file).href);
    for (const exported of Object.values(mod)) {
      if (typeof exported !== "function") continue;
      const controllerPath = Reflect.getMetadata("path", exported);
      if (controllerPath === undefined) continue;

      const proto = exported.prototype;
      const classPublic = Reflect.getMetadata(IS_PUBLIC_KEY, exported) === true;
      const classDecl =
        Boolean(Reflect.getMetadata(ROLES_KEY, exported)?.length) ||
        Boolean(Reflect.getMetadata(MIN_ROLE_KEY, exported)) ||
        Boolean(Reflect.getMetadata(PERMISSIONS_KEY, exported)?.length);
      const classGuards: unknown[] = Reflect.getMetadata("__guards__", exported) ?? [];

      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === "constructor") continue;
        const handler = proto[name];
        if (typeof handler !== "function") continue;
        const methodEnum = Reflect.getMetadata("method", handler);
        if (methodEnum === undefined) continue;

        const methodPath = Reflect.getMetadata("path", handler);
        const verb = REQUEST_METHOD_NAMES[methodEnum] ?? `M${methodEnum}`;
        const key = `${verb} ${normalizePath(controllerPath, methodPath)}`;

        const isPublic =
          classPublic || Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true;
        const hasDeclaration =
          classDecl ||
          Boolean(Reflect.getMetadata(ROLES_KEY, handler)?.length) ||
          Boolean(Reflect.getMetadata(MIN_ROLE_KEY, handler)) ||
          Boolean(Reflect.getMetadata(PERMISSIONS_KEY, handler)?.length);
        const methodGuards: unknown[] = Reflect.getMetadata("__guards__", handler) ?? [];
        const guardNames = [...classGuards, ...methodGuards].map(
          (g) => (g as { name?: string })?.name ?? String(g),
        );

        routes.push({ key, file, isPublic, hasDeclaration, guardNames });
      }
    }
  }
  return routes;
}

describe("路由权限覆盖(默认拒绝的 CI 闸门)", () => {
  it("每条非 @Public 路由都必须声明权限元数据,@Public 必须在白名单内", async () => {
    const routes = await collectRoutes();

    // 底册对照:当前 79 条路由,门槛留余量防 glob 静默失效
    expect(routes.length).toBeGreaterThanOrEqual(75);

    const undeclared = routes.filter((r) => !r.isPublic && !r.hasDeclaration);
    expect(
      undeclared.map((r) => `${r.key}(${r.file})`),
      "以下路由未声明任何权限元数据,会被全局 PermissionsGuard 403。" +
        "请添加 @AnyAuthenticated / @AdminOnly / @RequirePermissions 等,或(慎重)加 @Public 并更新白名单",
    ).toEqual([]);

    const unlistedPublic = routes.filter(
      (r) => r.isPublic && !PUBLIC_ALLOWLIST.has(r.key),
    );
    expect(
      unlistedPublic.map((r) => `${r.key}(${r.file})`),
      "以下 @Public 路由不在白名单内。公开一条路由是显式安全决策,请评估后更新本文件的 PUBLIC_ALLOWLIST",
    ).toEqual([]);

    // 白名单反向校验:防止路由改名后白名单条目变成僵尸(掩护未来同名路由)
    const routeKeys = new Set(routes.map((r) => r.key));
    const stale = [...PUBLIC_ALLOWLIST].filter((k) => !routeKeys.has(k));
    expect(stale, "白名单中存在已不存在的路由,请移除").toEqual([]);
  });

  it("服务间端点必须挂 ServiceAuthGuard(@Public 只绕过用户 JWT)", async () => {
    const routes = await collectRoutes();
    for (const key of SERVICE_GUARDED) {
      const route = routes.find((r) => r.key === key);
      expect(route, `服务间端点 ${key} 不存在`).toBeDefined();
      expect(
        route!.guardNames,
        `${key} 缺少 ServiceAuthGuard——@Public 路由若无服务令牌校验即完全裸奔`,
      ).toContain("ServiceAuthGuard");
    }
  });
});
