const UNIT_MULTIPLIERS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  y: 365 * 24 * 60 * 60 * 1000,
};

/** Parses durations like "15m", "7d", "-1s" into milliseconds. Ported from ai-call's auth.service. */
export function parseDurationMs(value: string): number {
  const match = value.match(/^(-?(?:\d+)?\.?\d+) *(ms|s|m|h|d|w|y)?$/i);
  if (!match) return 0;
  const amount = parseFloat(match[1] ?? "0");
  const unit = (match[2] ?? "ms").toLowerCase();
  return amount * (UNIT_MULTIPLIERS[unit] ?? 1);
}
