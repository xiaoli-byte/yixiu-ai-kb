import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import {
  buildMonthGrid,
  isInsideRange,
  mondayOffset,
  orderRange,
  parseISO,
  rangeBounds,
} from "./dateRange";

describe("dateRange 纯逻辑", () => {
  it("parseISO 解析合法日期、拒绝空串与非法值", () => {
    expect(parseISO("2026-07-14")?.format("YYYY-MM-DD")).toBe("2026-07-14");
    expect(parseISO("")).toBeNull();
    expect(parseISO("not-a-date")).toBeNull();
  });

  it("mondayOffset 周一为首：周一=0 … 周日=6", () => {
    expect(mondayOffset(dayjs("2026-07-13"))).toBe(0); // 周一
    expect(mondayOffset(dayjs("2026-07-14"))).toBe(1); // 周二
    expect(mondayOffset(dayjs("2026-07-19"))).toBe(6); // 周日
  });

  it("buildMonthGrid 生成 42 天、首格为周一、包住整月", () => {
    const grid = buildMonthGrid(dayjs("2026-07-14"));
    expect(grid).toHaveLength(42);
    // 2026-07-01 是周三 → 网格首格回退到 6-29（周一）
    expect(grid[0].format("YYYY-MM-DD")).toBe("2026-06-29");
    expect(mondayOffset(grid[0])).toBe(0);
    // 整月每一天都在网格内
    expect(grid.some((d) => d.format("YYYY-MM-DD") === "2026-07-01")).toBe(true);
    expect(grid.some((d) => d.format("YYYY-MM-DD") === "2026-07-31")).toBe(true);
  });

  it("orderRange 无论点击顺序都规整为 from<=to", () => {
    const early = dayjs("2026-07-05");
    const late = dayjs("2026-07-20");
    expect(orderRange(early, late)).toEqual({ from: "2026-07-05", to: "2026-07-20" });
    expect(orderRange(late, early)).toEqual({ from: "2026-07-05", to: "2026-07-20" }); // 逆序点击同结果
    expect(orderRange(early, early)).toEqual({ from: "2026-07-05", to: "2026-07-05" }); // 单日
  });

  it("rangeBounds 支持已定区间与待选预览、缺一端时为 null", () => {
    const a = dayjs("2026-07-05");
    const b = dayjs("2026-07-20");
    expect(rangeBounds(a, b, null)).toEqual({ lo: a, hi: b });
    // 只选起点 + 预览终点在起点之前 → 反向也能规整
    const preview = dayjs("2026-07-01");
    expect(rangeBounds(a, null, preview)).toEqual({ lo: preview, hi: a });
    expect(rangeBounds(null, null, null)).toBeNull();
    expect(rangeBounds(a, null, null)).toBeNull(); // 仅起点、无预览
  });

  it("isInsideRange 只认区间内部、排除两端", () => {
    const bounds = { lo: dayjs("2026-07-05"), hi: dayjs("2026-07-20") };
    expect(isInsideRange(dayjs("2026-07-10"), bounds)).toBe(true);
    expect(isInsideRange(dayjs("2026-07-05"), bounds)).toBe(false); // 端点不算内部
    expect(isInsideRange(dayjs("2026-07-20"), bounds)).toBe(false);
    expect(isInsideRange(dayjs("2026-07-21"), bounds)).toBe(false);
    expect(isInsideRange(dayjs("2026-07-10"), null)).toBe(false);
  });
});
