// file: src/studio/ui/modals/__tests__/modal-a11y.test.ts
import assert from "node:assert/strict";
import { computeTrapFocusIndex, isBackdropClick } from "../modal-a11y";
import { runSuite } from "../../../../testing/test-harness";

export async function runAll() {
  return runSuite("studio/ui/modals/modal-a11y", {
    "an empty dialog (no focusable elements) never traps"() {
      assert.equal(computeTrapFocusIndex(-1, 0, false), null);
      assert.equal(computeTrapFocusIndex(0, 0, true), null);
    },

    "Tab off the last focusable element wraps to the first"() {
      // 3 elements (indices 0,1,2); focus is on the last (2).
      assert.equal(computeTrapFocusIndex(2, 3, false), 0);
    },

    "Tab from a middle element does not trap"() {
      assert.equal(computeTrapFocusIndex(1, 3, false), null);
    },

    "Shift+Tab off the first focusable element wraps to the last"() {
      assert.equal(computeTrapFocusIndex(0, 3, true), 2);
    },

    "Shift+Tab from a middle element does not trap"() {
      assert.equal(computeTrapFocusIndex(1, 3, true), null);
    },

    "an untracked active element (-1, e.g. focus left the dialog) is treated as at the edge"() {
      // Forward: -1 is not >= count-1 unless count is 1, so no trap for a
      // 3-element dialog with untracked focus going forward...
      assert.equal(computeTrapFocusIndex(-1, 3, false), null);
      // ...but Shift+Tab from an untracked position (<=0) wraps to the last,
      // pulling focus back inside rather than leaving it free to escape.
      assert.equal(computeTrapFocusIndex(-1, 3, true), 2);
    },

    "a single-focusable-element dialog traps onto itself in both directions"() {
      assert.equal(computeTrapFocusIndex(0, 1, false), 0);
      assert.equal(computeTrapFocusIndex(0, 1, true), 0);
    },

    "a click whose target is the overlay itself is a backdrop click"() {
      const overlay = {} as EventTarget;
      assert.equal(isBackdropClick(overlay, overlay), true);
    },

    "a click on a descendant of the overlay is not a backdrop click"() {
      const overlay = {} as EventTarget;
      const child = {} as EventTarget;
      assert.equal(isBackdropClick(child, overlay), false);
    },

    "a null target is never a backdrop click"() {
      const overlay = {} as EventTarget;
      assert.equal(isBackdropClick(null, overlay), false);
    },
  });
}
