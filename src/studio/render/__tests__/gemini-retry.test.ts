// file: src/studio/render/__tests__/gemini-retry.test.ts
//
// P1-12 regression: proves the Gemini call in
// app/api/mockups/nanobanana/route.ts only retries genuinely transient
// failures (5xx, or Gemini's own "deadline" wording) and never retries a
// request that would fail identically every time (bad request, blocked
// prompt, bad API key). See gemini-retry.ts for the full rationale.
import assert from "node:assert/strict";
import { geminiErrorFromData, isRetryableGeminiFailure, parseGeminiJson } from "../gemini-retry";
import { runSuite } from "./test-harness";

export async function runAll() {
  return runSuite("studio/render/gemini-retry", {
    "parseGeminiJson parses a valid JSON body"() {
      assert.deepEqual(parseGeminiJson('{"error":"oops"}'), { error: "oops" });
    },

    "parseGeminiJson returns null for a malformed body instead of throwing"() {
      assert.equal(parseGeminiJson("not json"), null);
      assert.equal(parseGeminiJson(""), null);
    },

    "geminiErrorFromData reads a plain string error field"() {
      assert.equal(geminiErrorFromData({ error: "Deadline expired before operation could complete." }),
        "Deadline expired before operation could complete.");
    },

    "geminiErrorFromData reads a nested error.message"() {
      assert.equal(geminiErrorFromData({ error: { message: "Invalid API key" } }), "Invalid API key");
    },

    "geminiErrorFromData reads a prompt-blocked reason"() {
      assert.equal(
        geminiErrorFromData({ promptFeedback: { blockReason: "SAFETY" } }),
        "Gemini prompt blocked: SAFETY",
      );
    },

    "geminiErrorFromData reads a non-STOP candidate finish reason"() {
      assert.equal(
        geminiErrorFromData({ candidates: [{ finishReason: "SAFETY" }] }),
        "Gemini candidate finished without an image: SAFETY",
      );
    },

    "geminiErrorFromData returns null when there is nothing recognizable to report"() {
      assert.equal(geminiErrorFromData({ candidates: [{ finishReason: "STOP" }] }), null);
      assert.equal(geminiErrorFromData(null), null);
      assert.equal(geminiErrorFromData("not an object"), null);
    },

    "isRetryableGeminiFailure retries any 5xx status regardless of body"() {
      assert.equal(isRetryableGeminiFailure(500, ""), true);
      assert.equal(isRetryableGeminiFailure(503, "{}"), true);
    },

    "isRetryableGeminiFailure retries a 4xx that carries Gemini's own deadline-exceeded wording"() {
      assert.equal(
        isRetryableGeminiFailure(400, JSON.stringify({ error: { message: "Deadline expired before operation could complete." } })),
        true,
      );
    },

    "isRetryableGeminiFailure does NOT retry a genuine 4xx (bad request, blocked prompt, bad key)"() {
      assert.equal(isRetryableGeminiFailure(400, JSON.stringify({ error: { message: "Invalid request payload" } })), false);
      assert.equal(isRetryableGeminiFailure(401, JSON.stringify({ error: { message: "Invalid API key" } })), false);
      assert.equal(isRetryableGeminiFailure(400, JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } })), false);
    },

    "isRetryableGeminiFailure does NOT retry a 4xx with an unparseable body"() {
      assert.equal(isRetryableGeminiFailure(400, "not json"), false);
      assert.equal(isRetryableGeminiFailure(404, ""), false);
    },
  });
}
