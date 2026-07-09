import { describe, expect, it } from "vitest";
import { visibleWhereSql } from "./sql.js";
import type { AclSubjectContext } from "./types.js";

const ctx: AclSubjectContext = {
  userId: "user-1",
  tenantId: "tenant-1",
  roles: ["viewer"],
  departmentId: "dept-1",
};

describe("visibleWhereSql", () => {
  it("binds params in order starting at startIndex", () => {
    const { sql, values } = visibleWhereSql("d", "document", ctx, 1);
    expect(sql).toContain("$1");
    expect(sql).toContain("d.tenant_id = $1");
    expect(values[0]).toBe("tenant-1");
  });

  it("offsets placeholders when startIndex > 1", () => {
    const { sql } = visibleWhereSql("d", "document", ctx, 5);
    expect(sql).toContain("$5");
    expect(sql).not.toContain("$1 ");
  });

  it("includes a DEPARTMENT clause only when departmentId is present", () => {
    const withDept = visibleWhereSql("d", "document", ctx, 1);
    const withoutDept = visibleWhereSql(
      "d",
      "document",
      { ...ctx, departmentId: null },
      1,
    );
    expect(withDept.sql).toContain("DEPARTMENT");
    expect(withoutDept.sql).not.toContain("DEPARTMENT");
  });

  it("adds an owner clause only when ownerColumn is configured", () => {
    const withOwner = visibleWhereSql("d", "document", ctx, 1, { ownerColumn: "owner_id" });
    const withoutOwner = visibleWhereSql("d", "document", ctx, 1);
    expect(withOwner.sql).toContain("d.owner_id");
    expect(withoutOwner.sql).not.toContain("owner_id");
  });

  it("rejects unsafe alias/column identifiers", () => {
    expect(() => visibleWhereSql("d; DROP TABLE users;--", "document", ctx, 1)).toThrow();
    expect(() =>
      visibleWhereSql("d", "document", ctx, 1, { ownerColumn: "owner_id; --" }),
    ).toThrow();
  });

  it("resource_type and required perm are bound as params, not interpolated", () => {
    const { values } = visibleWhereSql("d", "document", ctx, 1);
    expect(values).toContain("document");
  });
});
