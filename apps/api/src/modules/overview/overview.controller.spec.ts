import { describe, expect, it, vi } from "vitest";
import { OverviewController } from "./overview.controller";

function createFixture() {
  const overview = {
    getMetrics: vi.fn().mockResolvedValue({ documentTotal: 1 }),
    getTrend: vi.fn().mockResolvedValue([]),
    getCategories: vi.fn().mockResolvedValue([]),
    getRecentActivities: vi.fn().mockResolvedValue([]),
  };
  const db = { tenantId: "tenant-1" };
  const controller = new OverviewController(overview as never, db as never);
  return { controller, overview, db };
}

describe("OverviewController", () => {
  it("metrics/categories 传入当前租户", async () => {
    const { controller, overview } = createFixture();
    await controller.metrics();
    await controller.categories();
    expect(overview.getMetrics).toHaveBeenCalledWith("tenant-1");
    expect(overview.getCategories).toHaveBeenCalledWith("tenant-1");
  });

  it("trend 归一化非法 range 为 today", async () => {
    const { controller, overview } = createFixture();
    await controller.trend("week");
    await controller.trend("bogus");
    await controller.trend(undefined);
    expect(overview.getTrend).toHaveBeenNthCalledWith(1, "tenant-1", "week");
    expect(overview.getTrend).toHaveBeenNthCalledWith(2, "tenant-1", "today");
    expect(overview.getTrend).toHaveBeenNthCalledWith(3, "tenant-1", "today");
  });

  it("recent-activities 解析 limit，非法回退 8", async () => {
    const { controller, overview } = createFixture();
    await controller.recentActivities("5");
    await controller.recentActivities("abc");
    expect(overview.getRecentActivities).toHaveBeenNthCalledWith(1, "tenant-1", 5);
    expect(overview.getRecentActivities).toHaveBeenNthCalledWith(2, "tenant-1", 8);
  });
});
