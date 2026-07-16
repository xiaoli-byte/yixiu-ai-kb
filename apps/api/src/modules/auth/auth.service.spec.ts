import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import { hashRefreshToken } from "@xiaoli-byte/authz";
import { AuthService } from "./auth.service";

const RAW_TOKEN = "refresh-record-id.a-very-long-random-refresh-secret";

function makeService() {
  const prisma = {
    membership: { findUnique: vi.fn().mockResolvedValue({ roles: ["editor"] }) },
    refreshToken: {
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    user: { findUnique: vi.fn() },
  };
  const config = {
    jwt: {
      accessSecret: "access-secret",
      refreshSecret: "unused-after-opaque-refresh-migration",
      accessTtl: "15m",
      refreshTtl: "7d",
    },
  };
  return { service: new AuthService(prisma as any, config as any), prisma };
}

describe("AuthService opaque refresh token rotation", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("校验完整 bcrypt 哈希、撤销旧 token 并签发新会话", async () => {
    const { service, prisma } = makeService();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: "refresh-record-id",
      userId: "u-1",
      tokenHash: await hashRefreshToken(RAW_TOKEN),
      revoked: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "u-1",
      tenantId: "t-1",
      email: "user@example.com",
      name: "User",
      role: "viewer",
    });

    const session = await service.refresh(RAW_TOKEN);

    expect(session.user.role).toBe("editor");
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).not.toBe(RAW_TOKEN);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: "refresh-record-id", revoked: false },
      data: { revoked: true },
    });
    expect(prisma.refreshToken.create.mock.calls[0][0].data.tokenHash).not.toContain(
      RAW_TOKEN.slice(-16),
    );
  });

  it("哈希不匹配时拒绝，不撤销任何记录", async () => {
    const { service, prisma } = makeService();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: "refresh-record-id",
      userId: "u-1",
      tokenHash: await hashRefreshToken("another-token"),
      revoked: false,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(service.refresh(RAW_TOKEN)).rejects.toThrow(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("已被并发请求撤销的 refresh token 不能再次轮换", async () => {
    const { service, prisma } = makeService();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: "refresh-record-id",
      userId: "u-1",
      tokenHash: await hashRefreshToken(RAW_TOKEN),
      revoked: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.refresh(RAW_TOKEN)).rejects.toThrow("Refresh token 已失效");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
