// file: src/studio/__tests__/artwork-overlay-visibility.test.ts
import assert from "node:assert/strict";
import {
  artworkOverlayOpacity,
  shouldMountArtworkOverlay,
} from "../artwork-overlay-visibility";
import { runSuite } from "../../testing/test-harness";

export async function runAll() {
  return runSuite("studio/artwork-overlay-visibility", {
    "the overlay is mounted whenever there is an artwork url"() {
      assert.equal(shouldMountArtworkOverlay({ artworkUrl: "/uploads/a.png" }), true);
    },

    "the overlay is not mounted when there is no artwork"() {
      assert.equal(shouldMountArtworkOverlay({ artworkUrl: null }), false);
    },

    // Regression for the "artwork gets stuck / can't drag again" bug: a
    // fresh, non-stale generated mockup used to unmount the only element
    // carrying onPointerDown, permanently disabling drag. Mounting must
    // stay true here regardless of mockup freshness -- only opacity may
    // react to it.
    "the overlay stays mounted even when a fresh (non-stale) mockup exists"() {
      assert.equal(
        shouldMountArtworkOverlay({ artworkUrl: "/uploads/a.png" }),
        true,
        "mounting must not depend on mockup freshness",
      );
    },

    "opacity is 1 (visible + draggable) when there is no generated mockup yet"() {
      assert.equal(
        artworkOverlayOpacity({ generatedMockupUrl: null, isMockupStale: false }),
        1,
      );
    },

    "opacity is 1 when the generated mockup is stale"() {
      assert.equal(
        artworkOverlayOpacity({ generatedMockupUrl: "/api/mockups/1/file", isMockupStale: true }),
        1,
      );
    },

    "opacity is 0 (hidden behind the fresh mockup image) only when a mockup exists and is fresh"() {
      assert.equal(
        artworkOverlayOpacity({ generatedMockupUrl: "/api/mockups/1/file", isMockupStale: false }),
        0,
      );
    },

    // The core regression: dragging calls discardMockups(), which is what
    // makes a mockup stale again -- so right after a drag, the overlay
    // must already be interactive (opacity 1) for the NEXT drag to be
    // startable, without ever needing a remount.
    "after a drag re-stales the mockup, the same still-mounted element becomes visible again"() {
      const beforeDrag = artworkOverlayOpacity({
        generatedMockupUrl: "/api/mockups/1/file",
        isMockupStale: false,
      });
      const afterDrag = artworkOverlayOpacity({
        generatedMockupUrl: "/api/mockups/1/file",
        isMockupStale: true,
      });
      assert.equal(beforeDrag, 0);
      assert.equal(afterDrag, 1);
      assert.equal(
        shouldMountArtworkOverlay({ artworkUrl: "/uploads/a.png" }),
        true,
        "the element that becomes visible again is the same element that was always mounted",
      );
    },
  });
}
