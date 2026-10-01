// file: src/studio/__tests__/artwork-overlay-visibility.test.ts
import assert from "node:assert/strict";
import { shouldMountArtworkOverlay } from "../artwork-overlay-visibility";
import { runSuite } from "../../testing/test-harness";

export async function runAll() {
  return runSuite("studio/artwork-overlay-visibility", {
    "the overlay is mounted whenever there is an artwork url"() {
      assert.equal(shouldMountArtworkOverlay({ artworkUrl: "/uploads/a.png" }), true);
    },

    "the overlay is not mounted when there is no artwork"() {
      assert.equal(shouldMountArtworkOverlay({ artworkUrl: null }), false);
    },

    // The core regression this module exists for: a fresh, non-stale
    // generated mockup used to unmount the only element carrying
    // onPointerDown, permanently disabling drag. Dragging is also the only
    // thing that re-stales a mockup, so that state was unescapable.
    // Mounting must therefore depend on nothing but the artwork itself --
    // there is deliberately no mockup parameter to pass.
    "mounting depends only on the artwork, so no mockup state can ever disable dragging"() {
      assert.equal(
        shouldMountArtworkOverlay({ artworkUrl: "/uploads/a.png" }),
        true,
        "mounting must not depend on mockup freshness",
      );
      assert.equal(shouldMountArtworkOverlay.length, 1, "takes only the artwork input");
    },
  });
}
