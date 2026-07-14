// 日期范围选择的纯逻辑（与 React 无关，便于单测）
// 全部基于 dayjs，日期以 "YYYY-MM-DD" ISO 字符串进出
import dayjs, { type Dayjs } from "dayjs";

export const DATE_FMT = "YYYY-MM-DD";

/** "YYYY-MM-DD"（ISO 日期）→ 有效 Dayjs 或 null；核心即可解析，无需插件 */
export function parseISO(str: string): Dayjs | null {
  if (!str) return null;
  const d = dayjs(str);
  return d.isValid() ? d : null;
}

/** 周一为首的星期偏移（周一=0 … 周日=6） */
export function mondayOffset(d: Dayjs): number {
  return (d.day() + 6) % 7;
}

/** 生成 6 周固定网格（42 天，周一为首），返回每格的 Dayjs */
export function buildMonthGrid(viewMonth: Dayjs): Dayjs[] {
  const monthStart = viewMonth.startOf("month");
  const gridStart = monthStart.subtract(mondayOffset(monthStart), "day");
  return Array.from({ length: 42 }, (_, i) => gridStart.add(i, "day"));
}

/** 两个日期规整为 {from<=to} 的 ISO 字符串区间 */
export function orderRange(a: Dayjs, b: Dayjs): { from: string; to: string } {
  const lo = a.isAfter(b, "day") ? b : a;
  const hi = a.isAfter(b, "day") ? a : b;
  return { from: lo.format(DATE_FMT), to: hi.format(DATE_FMT) };
}

/** 计算高亮区间边界（含待选预览）；未成区间返回 null */
export function rangeBounds(
  from: Dayjs | null,
  to: Dayjs | null,
  previewEnd: Dayjs | null,
): { lo: Dayjs; hi: Dayjs } | null {
  if (!from) return null;
  const end = to ?? previewEnd;
  if (!end) return null;
  return from.isAfter(end, "day") ? { lo: end, hi: from } : { lo: from, hi: end };
}

/** 某日是否落在区间「内部」（不含两端） */
export function isInsideRange(d: Dayjs, bounds: { lo: Dayjs; hi: Dayjs } | null): boolean {
  if (!bounds) return false;
  return d.isAfter(bounds.lo, "day") && d.isBefore(bounds.hi, "day");
}
