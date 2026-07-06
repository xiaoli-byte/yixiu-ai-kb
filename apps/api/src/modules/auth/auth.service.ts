import { Injectable, UnauthorizedException, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { PRISMA } from "../../database/database.service";
import { ClsService } from "nestjs-cls";

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly cls: ClsService,
  ) {}

  async validateUser(email: string, password: string, tenantId?: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, tenantId: tenantId || this.config.getOrThrow<string>("BOOTSTRAP_TENANT_ID") },
    });
    if (!user) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;
    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    if (!user) throw new UnauthorizedException("邮箱或密码错误");

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    };
    const accessToken = this.jwt.sign(payload);
    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      expiresIn: this.config.getOrThrow<string>("JWT_REFRESH_TTL"),
    });

    await this.storeRefreshToken(user.id, refreshToken);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  async refresh(token: string) {
    try {
      const payload = this.jwt.verify<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      });
      const stored = await this.prisma.refreshToken.findFirst({
        where: {
          userId: payload.sub,
          revoked: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });
      if (!stored) throw new UnauthorizedException("Refresh token 已失效");
      // 简化版：只校验存在性；可加 hash 校验
      const accessToken = this.jwt.sign({
        sub: payload.sub,
        email: payload.email,
        tenantId: payload.tenantId,
        role: payload.role,
      });
      return { accessToken };
    } catch {
      throw new UnauthorizedException("Refresh token 无效");
    }
  }

  private async storeRefreshToken(userId: string, token: string) {
    const decoded: any = this.jwt.decode(token);
    const exp = new Date(decoded.exp * 1000);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: token.slice(-32), // 简化：仅取尾部
        expiresAt: exp,
      },
    });
  }
}
