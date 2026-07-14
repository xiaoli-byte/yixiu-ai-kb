import { describe, expect, it, vi } from "vitest";
import { OverviewService } from "./overview.service";

function createService() {
  const db = {
    query: vi.fn(),
    queryOne: vi.fn(),
  };
  const service = new OverviewService(db as never);
  return { service, db };
}

describe("OverviewService", () => {
  it("getMetrics 按租户聚合并映射四路结果", async () => {
    const { service, db } = createService();
    db.queryOne
      .mockResolvedValueOnce({ total: 100, today: 5, yesterday: 3 }) // documents
      .mockResolvedValueOnce({ total: 40, today: 2, yesterday: 1 }) // qa
      .mockResolvedValueOnce({ total: 70, today: 6, yesterday: 4 }) // search
      .mockResolvedValueOnce({ active: 12 }); // active users

    const result = await service.getMetrics("tenant-1");

    expect(result).toEqual({
      documentTotal: 100,
      documentToday: 5,
      documentYesterday: 3,
      qaTotal: 40,
      qaToday: 2,
      qaYesterday: 1,
      searchTotal: 70,
      searchToday: 6,
      searchYesterday: 4,
      activeUsers7d: 12,
    });
    // 每路都带 tenantId 作为参数，且文档口径排除软删
    for (const call of db.queryOne.mock.calls) {
      expect(call[1]).toEqual(["tenant-1"]);
    }
    expect(db.queryOne.mock.calls[0][0]).toContain("deleted_at IS NULL");
    expect(db.queryOne.mock.calls[2][0]).toContain("event_type = 'SEARCH'");
  });

  it("getMetrics 对空结果降级为 0", async () => {
    const { service, db } = createService();
    db.queryOne.mockResolvedValue(null);
    const result = await service.getMetrics("t");
    expect(result.documentTotal).toBe(0);
    expect(result.activeUsers7d).toBe(0);
  });

  it("getTrend today 走小时分桶", async () => {
    const { service, db } = createService();
    db.query.mockResolvedValue([{ label: "09:00", value: 3 }]);
    const rows = await service.getTrend("tenant-1", "today");
    expect(rows).toEqual([{ label: "09:00", value: 3 }]);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("generate_series(date_trunc('day', now())");
    expect(sql).toContain("HH24:00");
    expect(params).toEqual(["tenant-1"]);
  });

  it("getTrend week/month 走按天分桶并传天数", async () => {
    const { service, db } = createService();
    db.query.mockResolvedValue([]);

    await service.getTrend("tenant-1", "week");
    expect(db.query.mock.calls[0][1]).toEqual(["tenant-1", 7]);
    expect(db.query.mock.calls[0][0]).toContain("MM-DD");

    await service.getTrend("tenant-1", "month");
    expect(db.query.mock.calls[1][1]).toEqual(["tenant-1", 30]);
  });

  it("getCategories 按文件夹分组，null 归未分类", async () => {
    const { service, db } = createService();
    db.query.mockResolvedValue([{ name: "产品文档", value: 8 }]);
    const rows = await service.getCategories("tenant-1");
    expect(rows).toEqual([{ name: "产品文档", value: 8 }]);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("COALESCE(f.name, '未分类')");
    expect(sql).toContain("d.deleted_at IS NULL");
    expect(params).toEqual(["tenant-1"]);
  });

  it("getRecentActivities 映射行并夹取 limit", async () => {
    const { service, db } = createService();
    db.query.mockResolvedValue([
      { time: "2026-07-14T00:00:00.000Z", actor: "张三", type: "upload", title: "手册.pdf", related_id: "d1" },
      { time: "2026-07-13T00:00:00.000Z", actor: null, type: "qa", title: "问题?", related_id: null },
    ]);

    const rows = await service.getRecentActivities("tenant-1", 999);
    expect(rows[0]).toEqual({
      time: "2026-07-14T00:00:00.000Z",
      actor: "张三",
      type: "upload",
      title: "手册.pdf",
      relatedId: "d1",
    });
    expect(rows[1].actor).toBeNull();
    expect(rows[1].relatedId).toBeNull();
    // limit 夹取到 [1,30]
    expect(db.query.mock.calls[0][1]).toEqual(["tenant-1", 30]);
  });
});
