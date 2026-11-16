// file: src/lib/admin/__tests__/export-filters.test.ts
import assert from "node:assert/strict";
import { exportCents, exportDate } from "../export-filters";
import { runSuite } from "../../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/admin/export-filters", {
    "a real day becomes the start or the end of that day (UTC)"() {
      assert.equal(exportDate("2026-11-15", false)?.toISOString(), "2026-11-15T00:00:00.000Z");
      assert.equal(exportDate("2026-11-15", true)?.toISOString(), "2026-11-15T23:59:59.999Z");
    },
    "impossible or malformed dates are ignored, never an Invalid Date (this was a 500)"() {
      for (const bad of ["9999-99-99", "2026-13-01", "2026-02-31", "2026-00-10", "garbage", "", "2026-1-1", "%00"]) assert.equal(exportDate(bad, false), undefined, bad);
    },
    "amounts become integer cents"() {
      assert.equal(exportCents("12.34"), 1234);
      assert.equal(exportCents("0"), 0);
      assert.equal(exportCents(" 5 "), 500);
    },
    "unusable or overflowing amounts are ignored (a huge one overflowed the Int column)"() {
      for (const bad of ["", "abc", "NaN", "Infinity", "1e30", "99999999999", "-99999999999"]) assert.equal(exportCents(bad), undefined, bad);
    },
  });
}
