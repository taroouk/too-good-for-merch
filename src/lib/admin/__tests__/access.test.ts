// file: src/lib/admin/__tests__/access.test.ts
//
// P1-9 regression: isAdminAccessAllowed is the ONLY place that decides
// whether a request is allowed into the admin area (requireAdmin() in
// ../auth.ts just fetches the row and defers to this). Verifies the 4
// cases the P1 report called out, plus the boundary conditions the real
// requireAdmin() caller can actually hand it (no such row, blockedAt as a
// Date vs. an ISO string, an unrelated role string).
import assert from "node:assert/strict";
import { isAdminAccessAllowed } from "../access";
import { runSuite } from "../../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/admin/access", {
    "Case A: ADMIN, not blocked -> allowed"() {
      assert.equal(isAdminAccessAllowed({ role: "ADMIN", blockedAt: null }), true);
    },

    "Case B: role changed away from ADMIN (demoted to USER) -> denied"() {
      assert.equal(isAdminAccessAllowed({ role: "USER", blockedAt: null }), false);
    },

    "Case C: ADMIN but blockedAt is set -> denied"() {
      assert.equal(isAdminAccessAllowed({ role: "ADMIN", blockedAt: new Date() }), false);
    },

    "Case C (string blockedAt from a JSON-serialized record) -> denied"() {
      assert.equal(
        isAdminAccessAllowed({ role: "ADMIN", blockedAt: "2026-01-01T00:00:00.000Z" }),
        false,
      );
    },

    "Case D: plain USER (never was ADMIN) -> denied"() {
      assert.equal(isAdminAccessAllowed({ role: "USER", blockedAt: null }), false);
    },

    "no matching user row (deleted/never existed) -> denied, not a crash"() {
      assert.equal(isAdminAccessAllowed(null), false);
      assert.equal(isAdminAccessAllowed(undefined), false);
    },

    "an unrelated/unknown role string -> denied (fails closed, not open)"() {
      assert.equal(isAdminAccessAllowed({ role: "SUPERUSER", blockedAt: null }), false);
    },

    "ADMIN + blocked takes precedence over role, never allowed on either check alone"() {
      assert.equal(isAdminAccessAllowed({ role: "ADMIN", blockedAt: new Date(0) }), false);
    },
  });
}
