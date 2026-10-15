// Pure maths for the admin Overview: rolling periods, previous-period
// comparison, chart buckets and the small derived KPIs. DB-free, unit tested.

export type Period = "7d" | "30d" | "90d";

export const PERIODS: Array<{ key: Period; label: string; days: number }> = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
];

export function parsePeriod(value: unknown): Period {
  return PERIODS.some((p) => p.key === value) ? (value as Period) : "7d";
}

const DAY = 24 * 60 * 60 * 1000;

export type PeriodRange = { days: number; start: Date; end: Date; prevStart: Date; prevEnd: Date };

// Rolling window ending now, and the equally long window right before it.
export function periodRange(period: Period, now: Date): PeriodRange {
  const days = PERIODS.find((p) => p.key === period)?.days ?? 7;
  const end = new Date(now);
  const start = new Date(end.getTime() - days * DAY);
  return { days, start, end, prevStart: new Date(start.getTime() - days * DAY), prevEnd: start };
}

export type Delta = { kind: "up" | "down" | "flat" | "new" | "none"; label: string };

// "+12.5%" style change versus the previous period. A previous value of zero
// has no percentage: it is "New" when there is something now, else nothing.
export function compareDelta(current: number, previous: number): Delta {
  if (previous === 0) return current === 0 ? { kind: "none", label: "—" } : { kind: "new", label: "New" };
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.05) return { kind: "flat", label: "0%" };
  const rounded = Math.abs(pct) >= 100 ? Math.round(pct) : Math.round(pct * 10) / 10;
  return { kind: pct > 0 ? "up" : "down", label: `${pct > 0 ? "+" : ""}${rounded}%` };
}

export type Bucket = { start: Date; end: Date; label: string; value: number };

// Daily bars up to 30 days, weekly beyond that.
export function periodBuckets(period: Period, now: Date): Bucket[] {
  const { days, start } = periodRange(period, now);
  const step = days > 30 ? 7 : 1;
  const out: Bucket[] = [];
  const origin = new Date(start);
  origin.setUTCHours(0, 0, 0, 0);
  for (let t = origin.getTime(); t < now.getTime(); t += step * DAY) {
    const bucketStart = new Date(t);
    out.push({
      start: bucketStart,
      end: new Date(t + step * DAY),
      label: bucketStart.toLocaleDateString("en", { day: "numeric", month: "short", timeZone: "UTC" }),
      value: 0,
    });
  }
  return out;
}

export function addToBuckets(buckets: Bucket[], date: Date, amount: number) {
  const bucket = buckets.find((b) => date >= b.start && date < b.end);
  if (bucket) bucket.value += amount;
}

// Share of orders created in the period that ended up paid (0-100), or null
// when nothing was created.
export function conversionRate(paid: number, created: number): number | null {
  if (created <= 0) return null;
  return Math.round((paid / created) * 1000) / 10;
}

export function averageOrderValueCents(revenueCents: number, paidOrders: number): number | null {
  return paidOrders > 0 ? Math.round(revenueCents / paidOrders) : null;
}
