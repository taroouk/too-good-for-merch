// file: src/pricing/__tests__/placements.test.ts
import assert from "node:assert/strict";
import {
  DEFAULT_PLACEMENTS,
  normalizePlacements,
  placementsFromCustomNotes,
  placementsOrDefault,
} from "../placements";
import { runSuite } from "../../testing/test-harness";

export async function runAll() {
  return runSuite("pricing/placements", {
    "normalizePlacements accepts a known array"() {
      assert.deepEqual(normalizePlacements(["left_chest", "FULL_BACK"]), ["LEFT_CHEST", "FULL_BACK"]);
    },

    "normalizePlacements drops unknown values"() {
      assert.deepEqual(normalizePlacements(["LEFT_CHEST", "NOT_A_PLACEMENT", "<script>"]), ["LEFT_CHEST"]);
    },

    "normalizePlacements de-duplicates"() {
      assert.deepEqual(normalizePlacements(["LEFT_CHEST", "LEFT_CHEST", "left_chest"]), ["LEFT_CHEST"]);
    },

    "normalizePlacements parses a comma-separated string"() {
      assert.deepEqual(normalizePlacements("LEFT_CHEST,FULL_BACK"), ["LEFT_CHEST", "FULL_BACK"]);
    },

    "normalizePlacements rejects non-array, non-string input"() {
      assert.deepEqual(normalizePlacements({ malicious: "object" }), []);
      assert.deepEqual(normalizePlacements(null), []);
      assert.deepEqual(normalizePlacements(undefined), []);
      assert.deepEqual(normalizePlacements(12345), []);
    },

    "placementsOrDefault falls back to the default placement"() {
      assert.deepEqual(placementsOrDefault([]), DEFAULT_PLACEMENTS);
      assert.deepEqual(placementsOrDefault(["bogus"]), DEFAULT_PLACEMENTS);
    },

    "placementsOrDefault keeps a valid selection"() {
      assert.deepEqual(placementsOrDefault(["FULL_FRONT"]), ["FULL_FRONT"]);
    },

    "placementsFromCustomNotes reads a JSON placements array"() {
      const notes = JSON.stringify({ placements: ["left_chest", "full_back"] });
      assert.deepEqual(placementsFromCustomNotes(notes), ["LEFT_CHEST", "FULL_BACK"]);
    },

    "placementsFromCustomNotes falls back to a PLACEMENTS= tag in free text"() {
      assert.deepEqual(
        placementsFromCustomNotes("Rush order please\nPLACEMENTS=LEFT_CHEST,FULL_BACK"),
        ["LEFT_CHEST", "FULL_BACK"],
      );
    },

    "placementsFromCustomNotes returns empty for blank/garbage notes"() {
      assert.deepEqual(placementsFromCustomNotes(null), []);
      assert.deepEqual(placementsFromCustomNotes(""), []);
      assert.deepEqual(placementsFromCustomNotes("no placement info here"), []);
    },
  });
}
