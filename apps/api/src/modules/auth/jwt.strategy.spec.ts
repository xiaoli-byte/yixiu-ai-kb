import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import { JwtStrategy, legacyDbRoleFix } from "./jwt.strategy";

// 词表映射本身(resolveKbRole)的用例在 packages/authz/src/core/roles.test.ts,
// 这里只测 ai-knowledge 侧的消费策略:未知角色拒绝+告警、CLS 写入、DB 脏角色自愈。

function makeStrategy() {
  const config = { jwt: { accessSecret: "test-secret", accessAlgorithm: "HS256" } };
  const cls = { set: vi.fn() };
  const prisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    membership: { upsert: vi.fn() },
    tenant: { findUnique: vi.fn() },
  };
  const strategy = new JwtStrategy(config as any, cls as any, prisma as any);
  return { strategy, cls, prisma };
}

describe("JwtStrategy.validate(角色策略:未知拒绝+告警)", () => {
  beforeEach(() => {
    delete process.env.FEDERATED_TENANT_ALLOWLIST;
  });

  it("词表外角色 token 被拒绝(fail closed),不打库", async () => {
    const { strategy, prisma } = makeStrategy();
    await expect(
      strategy.validate({ sub: "u1", tenantId: "t1", roles: ["auditor"] } as any),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("无任何角色 claim 的 token 被拒绝", async () => {
    const { strategy } = makeStrategy();
    await expect(
      strategy.validate({ sub: "u1", tenantId: "t1" } as any),
    ).rejects.toThrow("token 角色无法识别");
  });

  it("ai-call 的 operator 归一化为 editor,写入 CLS 与 req.user", async () => {
    const { strategy, cls, prisma } = makeStrategy();
    prisma.user.findUnique.mockResolvedValue({ id: "u1", role: "editor" });
    const result = await strategy.validate({
      sub: "u1",
      tenantId: "t1",
      roles: ["operator"],
      email: "a@b.c",
    } as any);
    expect(result.role).toBe("editor");
    expect(cls.set).toHaveBeenCalledWith("role", "editor");
  });

  it("已知+未知混合角色:未知不影响已知者生效", async () => {
    const { strategy, prisma } = makeStrategy();
    prisma.user.findUnique.mockResolvedValue({ id: "u1", role: "admin" });
    const result = await strategy.validate({
      sub: "u1",
      tenantId: "t1",
      roles: ["auditor", "tenant_admin"],
    } as any);
    expect(result.role).toBe("admin");
  });

  it("DB 遗留 operator 角色首次撞见时自愈为 editor", async () => {
    const { strategy, prisma } = makeStrategy();
    prisma.user.findUnique.mockResolvedValue({ id: "u1", role: "operator" });
    prisma.user.update.mockResolvedValue({});
    await strategy.validate({ sub: "u1", tenantId: "t1", roles: ["operator"] } as any);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { role: "editor" },
    });
  });

  it("DB 角色在词表内时不做任何修正", async () => {
    const { strategy, prisma } = makeStrategy();
    prisma.user.findUnique.mockResolvedValue({ id: "u1", role: "viewer" });
    await strategy.validate({ sub: "u1", tenantId: "t1", role: "viewer" } as any);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("legacyDbRoleFix(DB 遗留脏角色自愈)", () => {
  it("词表外的遗留 operator/tenant_admin 修正为 editor/admin", () => {
    expect(legacyDbRoleFix("operator")).toBe("editor");
    expect(legacyDbRoleFix("tenant_admin")).toBe("admin");
  });

  it("词表内的本地角色不做修正(返回 null)", () => {
    for (const role of ["super_admin", "admin", "editor", "viewer"]) {
      expect(legacyDbRoleFix(role)).toBeNull();
    }
  });

  it("完全未知的脏值不猜测(返回 null,运行时角色以 token 为准)", () => {
    expect(legacyDbRoleFix("garbage-role")).toBeNull();
  });
});
