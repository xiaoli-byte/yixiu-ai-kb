import { describe, expect, it } from "vitest";
import { resolveKbRole, ROLE_RANK, TO_KB_ROLE, KB_ROLES } from "./roles.js";

describe("resolveKbRole（跨系统角色词表解析）", () => {
  it("ai-call 的 operator 解析为本地 editor", () => {
    expect(resolveKbRole(["operator"])).toEqual({ role: "editor", unknown: [] });
  });

  it("ai-call 的 tenant_admin 解析为本地 admin", () => {
    expect(resolveKbRole(["tenant_admin"])).toEqual({ role: "admin", unknown: [] });
  });

  it("本地词表自映射（幂等，本地 token 不受影响）", () => {
    for (const role of KB_ROLES) {
      expect(resolveKbRole([role])).toEqual({ role, unknown: [] });
    }
  });

  it("多角色取映射后层级最高者", () => {
    expect(resolveKbRole(["viewer", "operator"]).role).toBe("editor");
    expect(resolveKbRole(["operator", "tenant_admin"]).role).toBe("admin");
  });

  it("未知角色进 unknown 列表，不猜测不降级", () => {
    expect(resolveKbRole(["auditor"])).toEqual({ role: null, unknown: ["auditor"] });
  });

  it("已知与未知混合：已知者生效，未知者仍上报", () => {
    expect(resolveKbRole(["auditor", "operator"])).toEqual({
      role: "editor",
      unknown: ["auditor"],
    });
  });

  it("空输入 / 全空值返回 role null", () => {
    expect(resolveKbRole([])).toEqual({ role: null, unknown: [] });
    expect(resolveKbRole([null, undefined, ""])).toEqual({ role: null, unknown: [] });
  });
});

describe("词表一致性约束", () => {
  it("映射表的值域必须落在本地词表内", () => {
    for (const target of Object.values(TO_KB_ROLE)) {
      expect(KB_ROLES).toContain(target);
    }
  });

  it("映射表与层级表键集一致（每个可映射角色都有层级）", () => {
    for (const key of Object.keys(TO_KB_ROLE)) {
      expect(ROLE_RANK[key]).toBeGreaterThan(0);
    }
  });

  it("别名对的层级一致（tenant_admin≡admin，operator≡editor）", () => {
    expect(ROLE_RANK.tenant_admin).toBe(ROLE_RANK.admin);
    expect(ROLE_RANK.operator).toBe(ROLE_RANK.editor);
  });
});
