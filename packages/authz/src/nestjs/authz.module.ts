import { Global, Module, type DynamicModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import { PermissionsGuard } from "./permissions.guard.js";
import { AUTHZ_OPTIONS } from "./tokens.js";
import type { AuthzOptions } from "./types.js";

/**
 * Registers `JwtAuthGuard` and `PermissionsGuard` as global `APP_GUARD`s, in that order
 * (auth first, then permissions — matches ai-call's existing app.module.ts pattern).
 *
 * Requires the host app to separately provide a global `ClsService`, e.g.:
 *   ClsModule.forRoot({ global: true, middleware: { mount: true } })
 * `AuthzModule` does not register its own `ClsModule` so it does not clash with a host
 * that already uses nestjs-cls for other purposes (ai-knowledge already does).
 */
@Global()
@Module({})
export class AuthzModule {
  static forRoot(options: AuthzOptions): DynamicModule {
    return {
      module: AuthzModule,
      providers: [
        { provide: AUTHZ_OPTIONS, useValue: options },
        JwtAuthGuard,
        PermissionsGuard,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
      exports: [AUTHZ_OPTIONS],
    };
  }
}
