// file: src/lib/artwork/__tests__/save.test.ts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  resolveArtworkUpsert,
  normalizeArtworkPlacement,
  ArtworkSaveError,
} from "../save";
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
  });
}
