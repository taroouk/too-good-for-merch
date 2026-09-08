// file: src/lib/artwork/__tests__/save.test.ts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  resolveArtworkUpsert,
  normalizeArtworkPlacement,
  ArtworkSaveError,
} from "../save";
import { TRANSFORM_BOUNDS } from "../../../studio/render/transform";
import { runSuite } from "../../../testing/test-harness";

const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]);

const mockup = {
  id: "mck_abc",
  mimeType: "image/png",
  data: bytes,
  model: "gemini-3.1-flash-image",
  prompt: "a bold graphic",
};

export async function runAll() {
  return runSuite("lib/artwork/save", {
    "copies the exact bytes and computes their sha256"() {
      const args = resolveArtworkUpsert({ userId: "u1", buildId: "b1", mockup });
      assert.deepEqual(Uint8Array.from(args.create.data), bytes);
      assert.equal(args.create.mimeType, "image/png");
      assert.equal(
        args.create.sha256,
        createHash("sha256").update(Buffer.from(bytes)).digest("hex"),
      );
      assert.equal(args.create.sourceMockupId, "mck_abc");
      assert.equal(args.create.model, "gemini-3.1-flash-image");
    },

    "keys the upsert on sourceMockupId so a repeat save never duplicates"() {
      const a = resolveArtworkUpsert({ userId: "u1", buildId: "b1", mockup });
      const b = resolveArtworkUpsert({ userId: "u1", buildId: "b1", mockup });
      assert.deepEqual(a.where, b.where);
      assert.deepEqual(a.where, { sourceMockupId: "mck_abc" });
      // update payload never re-writes sourceMockupId
      assert.equal("sourceMockupId" in a.update, false);
    },

    "throws when there is no generated mockup"() {
      assert.throws(
        () => resolveArtworkUpsert({ userId: "u1", buildId: "b1", mockup: null }),
        ArtworkSaveError,
      );
    },

    "throws when the mockup has no bytes"() {
      assert.throws(
        () =>
          resolveArtworkUpsert({
            userId: "u1",
            buildId: "b1",
            mockup: { ...mockup, data: new Uint8Array() },
          }),
        ArtworkSaveError,
      );
    },

    "normalizeArtworkPlacement fills sane defaults and drops junk"() {
      assert.deepEqual(normalizeArtworkPlacement({ placement: "FULL_FRONT", x: 0.5 }), {
        placement: "FULL_FRONT",
        x: 0.5,
        y: 0,
        scale: 1,
        rotation: 0,
      });
      assert.equal(normalizeArtworkPlacement(null), null);
      assert.equal(normalizeArtworkPlacement("nope"), null);
    },

    // P1-13: persisted placement must be bounds-checked against the same
    // TRANSFORM_BOUNDS the renderer enforces, so nothing rejected later by
    // validateTransform() can ever be written to BuildDraft.artworkPlacement.
    "normalizeArtworkPlacement accepts values already within bounds unchanged"() {
      const value = { placement: "CENTER_FRONT", x: 1, y: -1, scale: 1.5, rotation: 45 };
      assert.deepEqual(normalizeArtworkPlacement(value), value);
    },

    "normalizeArtworkPlacement falls back to identity defaults for NaN/Infinity"() {
      assert.deepEqual(
        normalizeArtworkPlacement({ x: NaN, y: Infinity, scale: -Infinity, rotation: NaN }),
        { placement: null, x: 0, y: 0, scale: 1, rotation: 0 },
      );
    },

    "normalizeArtworkPlacement clamps x beyond the max bound"() {
      const out = normalizeArtworkPlacement({ x: TRANSFORM_BOUNDS.x.max + 100 });
      assert.equal(out?.x, TRANSFORM_BOUNDS.x.max);
    },

    "normalizeArtworkPlacement clamps x below the min bound"() {
      const out = normalizeArtworkPlacement({ x: TRANSFORM_BOUNDS.x.min - 100 });
      assert.equal(out?.x, TRANSFORM_BOUNDS.x.min);
    },

    "normalizeArtworkPlacement clamps y beyond the max bound"() {
      const out = normalizeArtworkPlacement({ y: TRANSFORM_BOUNDS.y.max + 100 });
      assert.equal(out?.y, TRANSFORM_BOUNDS.y.max);
    },

    "normalizeArtworkPlacement clamps y below the min bound"() {
      const out = normalizeArtworkPlacement({ y: TRANSFORM_BOUNDS.y.min - 100 });
      assert.equal(out?.y, TRANSFORM_BOUNDS.y.min);
    },

    "normalizeArtworkPlacement clamps an out-of-range scale"() {
      const tooBig = normalizeArtworkPlacement({ scale: TRANSFORM_BOUNDS.scale.max + 10 });
      assert.equal(tooBig?.scale, TRANSFORM_BOUNDS.scale.max);
      const tooSmall = normalizeArtworkPlacement({ scale: TRANSFORM_BOUNDS.scale.min - 10 });
      assert.equal(tooSmall?.scale, TRANSFORM_BOUNDS.scale.min);
    },

    "normalizeArtworkPlacement clamps an out-of-range rotation"() {
      const tooBig = normalizeArtworkPlacement({ rotation: TRANSFORM_BOUNDS.rotation.max + 400 });
      assert.equal(tooBig?.rotation, TRANSFORM_BOUNDS.rotation.max);
      const tooSmall = normalizeArtworkPlacement({ rotation: TRANSFORM_BOUNDS.rotation.min - 400 });
      assert.equal(tooSmall?.rotation, TRANSFORM_BOUNDS.rotation.min);
    },
  });
}
