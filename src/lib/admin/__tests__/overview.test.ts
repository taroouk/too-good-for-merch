// file: src/lib/admin/__tests__/overview.test.ts
import assert from "node:assert/strict";
import { addToBuckets, averageOrderValueCents, compareDelta, conversionRate, parsePeriod, periodBuckets, periodRange } from "../overview";
import { runSuite } from "../../../testing/test-harness";

const now = new Date("2026-10-15T12:00:00Z");

export async function runAll() {
  return runSuite("admin/overview", {
    "parsePeriod falls back to 7 days"() {
      assert.equal(parsePeriod("30d"), "30d");
      assert.equal(parsePeriod("weird"), "7d");
      assert.equal(parsePeriod(undefined), "7d");
    },
    "periodRange gives an equally long previous window right before"() {
      const r = periodRange("30d", now);
      assert.equal(r.days, 30);
      assert.equal(r.end.getTime(), now.getTime());
      assert.equal(r.prevEnd.getTime(), r.start.getTime());
      assert.equal(r.start.getTime() - r.prevStart.getTime(), r.end.getTime() - r.start.getTime());
    },
    "compareDelta"() {
      assert.deepEqual(compareDelta(112.5, 100), { kind: "up", label: "+12.5%" });
      assert.deepEqual(compareDelta(50, 100), { kind: "down", label: "-50%" });
      assert.deepEqual(compareDelta(5, 0), { kind: "new", label: "New" });
      assert.deepEqual(compareDelta(0, 0), { kind: "none", label: "—" });
      assert.equal(compareDelta(100, 100).kind, "flat");
      assert.equal(compareDelta(300, 100).label, "+200%");
    },
    "buckets are daily up to 30 days and weekly beyond; values land in the right one"() {
      const week = periodBuckets("7d", now);
      assert.equal(week.length >= 7 && week.length <= 8, true);
      const quarter = periodBuckets("90d", now);
      assert.equal(quarter.length >= 12 && quarter.length <= 14, true);
      addToBuckets(week, new Date("2026-10-15T08:00:00Z"), 500);
      addToBuckets(week, new Date("2026-10-15T09:00:00Z"), 250);
      assert.equal(week.reduce((s, b) => s + b.value, 0), 750);
      addToBuckets(week, new Date("2020-01-01T00:00:00Z"), 999); // outside: ignored
      assert.equal(week.reduce((s, b) => s + b.value, 0), 750);
    },
    "conversion and average order value"() {
      assert.equal(conversionRate(3, 12), 25);
      assert.equal(conversionRate(0, 0), null);
      assert.equal(averageOrderValueCents(10_000, 4), 2500);
      assert.equal(averageOrderValueCents(0, 0), null);
    },
  });
}
