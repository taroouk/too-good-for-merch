// file: src/lib/admin/__tests__/notes.test.ts
//
// P3-21g regression: requireNoteParent is the exact guard
// addAdminNoteAction (src/actions/admin-order-actions.ts) and
// addBespokeRequestNoteAction (src/actions/admin-bespoke-actions.ts) call
// with their real Prisma lookup result before writing a note -- so this
// covers the real accept/reject decision those actions make for "does the
// parent record still exist", without needing a Prisma/Next runtime (see
// src/lib/admin/notes.ts for why the decision itself was split out).
import assert from "node:assert/strict";
import { requireNoteParent } from "../notes";
import { runSuite } from "../../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/admin/notes", {
    "nonexistent Order (Prisma findUnique returned null) -> rejected cleanly"() {
      assert.throws(
        () => requireNoteParent(null, "Order not found."),
        /^Error: Order not found\.$/,
      );
    },

    "existing Order (Prisma findUnique returned the row) -> passes through unchanged"() {
      const order = { id: "order-123" };
      assert.equal(requireNoteParent(order, "Order not found."), order);
    },

    "nonexistent BespokeRequest (Prisma findUnique returned null) -> rejected cleanly"() {
      assert.throws(
        () => requireNoteParent(null, "Bespoke request not found."),
        /^Error: Bespoke request not found\.$/,
      );
    },

    "existing BespokeRequest (Prisma findUnique returned the row) -> passes through unchanged"() {
      const request = { id: "request-456" };
      assert.equal(requireNoteParent(request, "Bespoke request not found."), request);
    },

    "undefined (not just null) is also rejected, not a crash"() {
      assert.throws(() => requireNoteParent(undefined, "Order not found."));
    },
  });
}
