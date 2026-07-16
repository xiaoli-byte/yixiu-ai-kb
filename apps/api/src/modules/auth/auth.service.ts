import { Injectable, UnauthorizedException, Inject } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PRISMA } from "../../database/database.service";
import { AppConfigService } from "../../config/app-config.service";
import {
  generateRefreshToken,
  hashRefreshToken,
  parseDurationMs,
  resolveKbRole,
  signAccessToken,
  verifyRefreshTokenHash,
} from "@xiaoli-byte/authz";

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role?: string;
  roles?: string[];
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  accessMaxAgeMs: number;
  refreshMaxAgeMs: number;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    tenantId: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly config: AppConfigService,
  ) {}

  async validateUser(email: string, password: string, tenantId?: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, tenantId: tenantId || this.config.bootstrap.tenantId },
    });
    if (!user || user.status !== "active") return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;
    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    if (!user) throw new UnauthorizedException("邮箱或密码错误");

    return this.createSession(user);
  }

  async refresh(token: string) {
    const stored = await this.findValidRefreshToken(token);

    // 单次使用：并发刷新只有第一个请求能将 revoked 从 false 改为 true。
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revoked: false },
      data: { revoked: true },
    });
    if (revoked.count !== 1) throw new UnauthorizedException("Refresh token 已失效");

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || user.status !== "active") {
      throw new UnauthorizedException("Refresh token 对应用户已停用或不存在");
    }
    return this.createSession(user);
  }

  async revokeRefreshToken(token: string): Promise<void> {
    const stored = await this.findValidRefreshToken(token);
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });
  }

  private async createSession(user: {
    id: string;
    tenantId: string;
    email: string;
    name: string;
    role: string;
  }): Promise<AuthSession> {
    const role = await this.getEffectiveRole(user.id, user.tenantId, user.role);
    const accessMaxAgeMs = this.durationOrThrow(this.config.jwt.accessTtl, "JWT_ACCESS_TTL");
    const refreshMaxAgeMs = this.durationOrThrow(this.config.jwt.refreshTtl, "JWT_REFRESH_TTL");
    const accessToken = signAccessToken(
      { sub: user.id, email: user.email, tenantId: user.tenantId, roles: [role] },
      {
        secret: this.config.jwt.accessSecret,
        privateKey: this.config.jwt.accessPrivateKey || undefined,
        algorithm: this.config.jwt.accessAlgorithm,
        keyId: this.config.jwt.accessKeyId,
        ttl: this.config.jwt.accessTtl,
      },
    );
    const refreshToken = await this.storeRefreshToken(user.id, refreshMaxAgeMs);

    return {
      accessToken,
      refreshToken,
      accessMaxAgeMs,
      refreshMaxAgeMs,
      user: { id: user.id, email: user.email, name: user.name, role, tenantId: user.tenantId },
    };
  }

  private async getEffectiveRole(userId: string, tenantId: string, legacyRole: string): Promise<string> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { roles: true },
    });
    // 迁移期双读：Membership 优先；缺失/空记录才回退 User.role。
    return resolveKbRole(membership?.roles ?? []).role ?? legacyRole;
  }

  private async storeRefreshToken(userId: string, maxAgeMs: number): Promise<string> {
    // token 结构为 "记录 ID.随机秘密"。ID 只用于定位单行，秘密的完整值以 bcrypt
    // 哈希存库；既不保存 token 明文，也不再使用可伪造/可读 claims 的 refresh JWT。
    const id = randomUUID();
    const token = `${id}.${generateRefreshToken()}`;
    await this.prisma.refreshToken.create({
      data: {
        id,
        userId,
        tokenHash: await hashRefreshToken(token),
        expiresAt: new Date(Date.now() + maxAgeMs),
      },
    });
    return token;
  }

  private async findValidRefreshToken(token: string) {
    const separator = token.indexOf(".");
    if (separator <= 0 || separator === token.length - 1) {
      throw new UnauthorizedException("Refresh token 无效");
    }
    const stored = await this.prisma.refreshToken.findUnique({
      where: { id: token.slice(0, separator) },
    });
    if (!stored || stored.revoked || stored.expiresAt <= new Date()) {
      throw new UnauthorizedException("Refresh token 已失效");
    }
    if (!(await verifyRefreshTokenHash(token, stored.tokenHash))) {
      throw new UnauthorizedException("Refresh token 无效");
    }
    return stored;
  }

  private durationOrThrow(value: string, name: string): number {
    const duration = parseDurationMs(value);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(`${name} 必须是正的时间长度`);
    }
    return duration;
  }
}
