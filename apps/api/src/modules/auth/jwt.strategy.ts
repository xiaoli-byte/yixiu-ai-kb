import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy, type JwtFromRequestFunction } from "passport-jwt";
import type { Request } from "express";
import { ClsService } from "nestjs-cls";
import { JwtPayload } from "./auth.service";
import { AppConfigService } from "../../config/app-config.service";

// 微前端（Multi-Zones）无状态联合登录：ai-call 同域内嵌时，浏览器会带上 ai-call
// 下发的 httpOnly access_token cookie（@xiaoli-byte/authz 默认名）。这里从 Cookie 头
// 解析它，不依赖 cookie-parser 中间件；独立部署无 cookie 时返回 null，自动回落 Bearer。
const ACCESS_COOKIE_NAME = "access_token";
const cookieExtractor: JwtFromRequestFunction = (req: Request) => {
  const raw = req?.headers?.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === ACCESS_COOKIE_NAME) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: AppConfigService, private readonly cls: ClsService) {
    super({
      // cookie 优先（同域内嵌 SSO），回落 Authorization: Bearer（独立部署 / 服务调用）。
      // 前提：ai-knowledge JWT_ACCESS_SECRET 与 ai-call JWT_SECRET 统一，否则 cookie 验签不过。
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: config.jwt.accessSecret,
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload & { roles?: string[]; name?: string }) {
    if (!payload?.sub) throw new UnauthorizedException("Token 无效");
    // claim 兼容：ai-knowledge 用单数 role；ai-call（@xiaoli-byte/authz）用复数 roles。
    const role = payload.role ?? payload.roles?.[0];
    this.cls.set("userId", payload.sub);
    this.cls.set("tenantId", payload.tenantId);
    this.cls.set("role", role);
    // 归一化给 /auth/me 用（web 需要 id/email/role）。无状态联合：外来 ai-call 身份
    // 在本库无用户记录，只能看到租户级可见内容，owner 归属功能对其降级（见设计文档）。
    return { ...payload, role, id: payload.sub, name: payload.name ?? payload.email };
  }
}
