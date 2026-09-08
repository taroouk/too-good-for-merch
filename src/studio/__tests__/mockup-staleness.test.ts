// file: src/studio/__tests__/mockup-staleness.test.ts
import assert from "node:assert/strict";
import { isMockupStale } from "../mockup-staleness";
import { runSuite } from "../../testing/test-harness";

const LIVE = "live-fingerprint";

export async function runAll() {
  return runSuite("studio/mockup-staleness", {
    "no persisted mockup is not stale"() {
      assert.equal(
        isMockupStale({ url: null, fingerprint: null, liveFingerprint: LIVE }),
        false,
      );
    },

    "no persisted mockup is not stale even if a stray fingerprint is present"() {
      assert.equal(
        isMockupStale({ url: null, fingerprint: "other", liveFingerprint: LIVE }),
        false,
      );
    },

    "a mockup whose fingerprint matches the live one is fresh"() {
      assert.equal(
        isMockupStale({ url: "/api/mockups/1/file", fingerprint: LIVE, liveFingerprint: LIVE }),
        false,
      );
    },

    "a mockup whose fingerprint differs from the live one is stale"() {
      assert.equal(
        isMockupStale({ url: "/api/mockups/1/file", fingerprint: "old", liveFingerprint: LIVE }),
        true,
      );
    },

    // P3-21a regression: the pre-fix logic returned false here, which both
    // hid the stale badge and hid the regenerate button.
    "a persisted mockup with a null fingerprint is stale, not fresh"() {
      assert.equal(
        isMockupStale({ url: "/api/mockups/1/file", fingerprint: null, liveFingerprint: LIVE }),
        true,
      );
    },

    "a persisted mockup with an empty-string fingerprint is stale"() {
      assert.equal(
        isMockupStale({ url: "/api/mockups/1/file", fingerprint: "", liveFingerprint: LIVE }),
        true,
      );
    },
  });
}
