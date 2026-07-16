import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto, RefreshDto } from "./dto";
import { RateLimit, RateLimitPolicies } from "../../common/rate-limit/rate-limit.guard";
import { Public } from "../../common/decorators/public.decorator";
import { AnyAuthenticated } from "../../common/permissions/permissions.guard";
import {
  accessCookieName,
  buildAccessCookieOptions,
  buildRefreshCookieOptions,
  refreshCookieName,
} from "@xiaoli-byte/authz";
import { AppConfigService } from "../../config/app-config.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Post("login")
  @RateLimit({ ...RateLimitPolicies.auth, message: "登录尝试次数过多，请 15 分钟后再试" })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.login(dto.email, dto.password);
    this.setSessionCookies(response, session);
    return { user: session.user };
  }

  @Public()
  @Post("refresh")
  @RateLimit({ windowMs: 60 * 1000, max: 30, message: "刷新过于频繁" })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = this.readCookie(request, refreshCookieName(this.cookieConfig())) ?? dto.refreshToken;
    if (!refreshToken) throw new UnauthorizedException("缺少 Refresh token");
    const session = await this.auth.refresh(refreshToken);
    this.setSessionCookies(response, session);
    return { user: session.user };
  }

  @AnyAuthenticated()
  @Post("logout")
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = this.readCookie(request, refreshCookieName(this.cookieConfig()));
    if (refreshToken) {
      await this.auth.revokeRefreshToken(refreshToken).catch(() => undefined);
    }
    this.clearSessionCookies(response);
    return { ok: true };
  }

  @AnyAuthenticated()
  @Get("me")
  me(@Req() req: any) {
    return { user: req.user };
  }

  private cookieConfig() {
    return { isProd: this.config.isProduction };
  }

  private setSessionCookies(
    response: Response,
    session: { accessToken: string; refreshToken: string; accessMaxAgeMs: number; refreshMaxAgeMs: number },
  ) {
    const config = this.cookieConfig();
    response.cookie(
      accessCookieName(config),
      session.accessToken,
      buildAccessCookieOptions(config, session.accessMaxAgeMs),
    );
    response.cookie(
      refreshCookieName(config),
      session.refreshToken,
      buildRefreshCookieOptions(config, session.refreshMaxAgeMs),
    );
  }

  private clearSessionCookies(response: Response) {
    const config = this.cookieConfig();
    response.clearCookie(accessCookieName(config), buildAccessCookieOptions(config, 0));
    response.clearCookie(refreshCookieName(config), buildRefreshCookieOptions(config, 0));
  }

  private readCookie(request: Request, name: string): string | undefined {
    const raw = request.headers.cookie;
    if (!raw) return undefined;
    for (const part of raw.split(";")) {
      const separator = part.indexOf("=");
      if (separator >= 0 && part.slice(0, separator).trim() === name) {
        try {
          return decodeURIComponent(part.slice(separator + 1).trim());
        } catch {
          return undefined;
        }
      }
    }
    return undefined;
  }
}
