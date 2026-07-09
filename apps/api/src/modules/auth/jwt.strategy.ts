import { Injectable, UnauthorizedException, Inject, Logger } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy, type JwtFromRequestFunction } from "passport-jwt";
import type { Request } from "express";
import { PrismaClient } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import { JwtPayload } from "./auth.service";
import { PRISMA } from "../../database/database.service";
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

// 外部（联合）身份的占位密码哈希：非 bcrypt 串，bcrypt.compare 永远返回 false，
// 即这些用户不能在 ai-knowledge 本地登录（只能经 ai-call 联合登录）。
const FEDERATED_PASSWORD_SENTINEL = "!federated-sso-no-local-login";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  // 已确认存在/已开通的 userId 内存缓存，避免每请求打库。
  private readonly knownUserIds = new Set<string>();

  constructor(
    config: AppConfigService,
    private readonly cls: ClsService,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {
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
    // CALL-13(a) JIT 开通：跨系统（ai-call）身份在本库无 user 行，会使按 owner_id 外键的
    // 写操作（如文档上传）失败。首次见到合法但陌生的 userId 时，按 token claim 幂等补建一个
    // 外部身份 user 行。已存在则不动本地用户资料；对独立部署无影响（本地用户命中缓存/无操作）。
    await this.ensureUserProvisioned(payload, role);
    this.cls.set("userId", payload.sub);
    this.cls.set("tenantId", payload.tenantId);
    this.cls.set("role", role);
    // 归一化给 /auth/me 用（web 需要 id/email/role）。
    return { ...payload, role, id: payload.sub, name: payload.name ?? payload.email };
  }

  private async ensureUserProvisioned(
    payload: JwtPayload & { name?: string },
    role?: string,
  ): Promise<void> {
    const id = payload.sub;
    if (!id || this.knownUserIds.has(id)) return;
    // email 必填且 (tenantId,email) 唯一；缺 email 时用确定性兜底，避免撞已有用户。
    const email = payload.email?.trim() || `${id}@federated.local`;
    try {
      await this.prisma.user.upsert({
        where: { id },
        update: {}, // 已存在则不覆盖本地用户资料（name/role/email 以本地为准）
        create: {
          id,
          tenantId: payload.tenantId,
          email,
          name: payload.name?.trim() || payload.email?.trim() || id,
          passwordHash: FEDERATED_PASSWORD_SENTINEL,
          role: role ?? "viewer",
        },
      });
      this.knownUserIds.add(id);
    } catch (err) {
      // 典型：(tenantId,email) 唯一冲突——已有同邮箱的本地用户但 id 不同（email 冲突边界，
      // 见 CALL-13 风险）。不阻断鉴权；此时 owner 写操作仍可能失败，需人工对齐账号。
      this.logger.warn(
        `JIT 开通联合身份用户失败（id=${id}）：${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
