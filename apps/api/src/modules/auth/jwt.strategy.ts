import { Injectable, UnauthorizedException, Inject, Logger } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy, type JwtFromRequestFunction } from "passport-jwt";
import type { Request } from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import { JwtPayload } from "./auth.service";
import { PRISMA } from "../../database/database.service";
import { AppConfigService } from "../../config/app-config.service";

// 微前端（Multi-Zones）无状态联合登录：ai-call 同域内嵌时，浏览器会带上 ai-call
// 下发的 httpOnly access_token cookie（@xiaoli-byte/authz 默认名）。这里从 Cookie 头
// 解析它，不依赖 cookie-parser 中间件；无 cookie 时返回 null。
const ACCESS_COOKIE_NAME = "access_token";
const cookieExtractor: JwtFromRequestFunction = (req: Request) => {
  const raw = req?.headers?.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === ACCESS_COOKIE_NAME) {
      const value = part.slice(idx + 1).trim();
      // 畸形百分号序列（如裸 "%"）会让 decodeURIComponent 抛 URIError，从提取器一路
      // 炸成 500 而非 401。JWT 本身是 URL-safe 的，解不开就原样返回交给验签去拒。
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
};

// 外部（联合）身份的占位密码哈希：非 bcrypt 串，bcrypt.compare 永远返回 false，
// 即这些用户不能在 ai-knowledge 本地登录（只能经 ai-call 联合登录）。
const FEDERATED_PASSWORD_SENTINEL = "!federated-sso-no-local-login";

// JIT 开通失败后的负缓存窗口：期间同一 userId 不再打库、不再刷日志。
const PROVISION_RETRY_MS = 60_000;

interface ProvisionFailure {
  retryAt: number;
  /** true = 准入拒绝（租户未开通/不在白名单）→ 窗口内直接 401；false = 软失败（鉴权照过，只是没建行） */
  failClosed: boolean;
  reason: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  // 已确认存在/已开通的 userId 内存缓存，避免每请求打库。
  private readonly knownUserIds = new Set<string>();
  // JIT 失败负缓存：避免同一冲突用户每请求一次打库 + 一条 warn（日志刷屏/无谓写库）。
  private readonly provisionFailures = new Map<string, ProvisionFailure>();
  // FEDERATED_TENANT_ALLOWLIST：逗号分隔的租户 id 白名单，限制哪些租户的联合身份允许
  // JIT 开通；不设 = 不额外限制。无论是否设白名单，租户都必须已存在于本库 tenants 表
  // 且 active —— 租户开通永远是显式运维动作，JIT 只到用户级。
  private readonly tenantAllowlist: ReadonlySet<string> | null;

  constructor(
    config: AppConfigService,
    private readonly cls: ClsService,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {
    super({
      // Bearer 优先（显式凭证 > 环境凭证）：同域下本地登录的 Bearer 用户不会被浏览器里
      // 残留的 ai-call cookie 静默顶替身份；无 Bearer 时回落 cookie（微前端联合登录）。
      // 前提：ai-knowledge JWT_ACCESS_SECRET 与 ai-call JWT_SECRET 统一，否则 cookie 验签不过。
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        cookieExtractor,
      ]),
      secretOrKey: config.jwt.accessSecret,
      ignoreExpiration: false,
    });
    const allowlist = (process.env.FEDERATED_TENANT_ALLOWLIST ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    this.tenantAllowlist = allowlist.length > 0 ? new Set(allowlist) : null;
  }

  async validate(payload: JwtPayload & { roles?: string[]; name?: string }) {
    if (!payload?.sub) throw new UnauthorizedException("Token 无效");
    // claim 兼容：ai-knowledge 用单数 role；ai-call（@xiaoli-byte/authz）用复数 roles。
    const role = payload.role ?? payload.roles?.[0];
    // CALL-13(a) JIT 开通：跨系统（ai-call）身份在本库无 user 行，会使按 owner_id 外键的
    // 写操作（如文档上传）失败。首次见到合法但陌生的 userId 时，校验租户准入后补建一个
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
    const failure = this.provisionFailures.get(id);
    if (failure && Date.now() < failure.retryAt) {
      // 负缓存窗口内：准入拒绝维持 401（fail closed），软失败静默放行（与失败当次一致）。
      if (failure.failClosed) throw new UnauthorizedException(failure.reason);
      return;
    }
    try {
      const existing = await this.prisma.user.findUnique({
        where: { id },
        select: { id: true },
      });
      if (existing) {
        this.knownUserIds.add(id);
        this.provisionFailures.delete(id);
        return;
      }
      // —— 走到这里 = 合法 token 但本库无用户行（联合身份首次出现），进入创建路径 ——
      // 租户准入（CALL-13）：token 里的 tenantId 必须已存在于 tenants 表且 active，否则
      // 拒绝开通并拒绝鉴权（fail closed）。tenant_id 目前无外键约束（见 schema KB-01 注释），
      // 不校验的话任意 ai-call 租户会被隐式"入驻"并产生悬空 tenant_id 数据。
      // 本地已有用户永远走不到这里，fail closed 只影响未开通租户的联合身份。
      const tenantId = payload.tenantId;
      if (!tenantId) {
        throw new UnauthorizedException("联合登录 token 缺少 tenantId，拒绝开通");
      }
      if (this.tenantAllowlist && !this.tenantAllowlist.has(tenantId)) {
        throw new UnauthorizedException(
          `租户 ${tenantId} 不在联合登录白名单（FEDERATED_TENANT_ALLOWLIST）内`,
        );
      }
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { status: true },
      });
      if (!tenant || tenant.status !== "active") {
        throw new UnauthorizedException(`租户 ${tenantId} 未在知识库系统开通，拒绝联合登录`);
      }
      // email 必填且 (tenantId,email) 唯一；缺 email 时用确定性兜底，避免撞已有用户。
      const email = payload.email?.trim() || `${id}@federated.local`;
      await this.prisma.user.create({
        data: {
          id,
          tenantId,
          email,
          name: payload.name?.trim() || payload.email?.trim() || id,
          passwordHash: FEDERATED_PASSWORD_SENTINEL,
          role: role ?? "viewer",
        },
      });
      this.knownUserIds.add(id);
      this.provisionFailures.delete(id);
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        // 准入拒绝：负缓存 + fail closed，窗口内同一 id 不再打库、直接 401。
        this.provisionFailures.set(id, {
          retryAt: Date.now() + PROVISION_RETRY_MS,
          failClosed: true,
          reason: err.message,
        });
        this.logger.warn(`JIT 开通被拒（id=${id}）：${err.message}`);
        throw err;
      }
      // 并发首请求竞态：另一请求可能刚建出同一 id（主键 P2002）。重查一次而不是解析
      // err.meta.target —— 后者的字段命名在不同连接器下不稳定。
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const nowExists = await this.prisma.user
          .findUnique({ where: { id }, select: { id: true } })
          .catch(() => null);
        if (nowExists) {
          this.knownUserIds.add(id);
          this.provisionFailures.delete(id);
          return;
        }
      }
      // 典型：(tenantId,email) 唯一冲突——已有同邮箱的本地用户但 id 不同（email 冲突边界，
      // 见 CALL-13 风险）。不阻断鉴权；此时 owner 写操作仍可能失败，需人工对齐账号。
      this.provisionFailures.set(id, {
        retryAt: Date.now() + PROVISION_RETRY_MS,
        failClosed: false,
        reason: err instanceof Error ? err.message : String(err),
      });
      this.logger.warn(
        `JIT 开通联合身份用户失败（id=${id}，${PROVISION_RETRY_MS / 1000}s 内不重试）：${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
