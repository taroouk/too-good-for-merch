// file: src/lib/mockups/__tests__/gemini-endpoint.test.ts
// The Gemini request carries the API key, so where it goes is security relevant: only a loopback stand-in may replace Google, and never
// in production.
import assert from "node:assert/strict";
import { GOOGLE_GEMINI_INTERACTIONS_ENDPOINT as GOOGLE, resolveGeminiEndpoint } from "../gemini-endpoint";
import { runSuite } from "../../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/mockups/gemini-endpoint", {
    "no override: Google"() {
      assert.equal(resolveGeminiEndpoint({}), GOOGLE);
      assert.equal(resolveGeminiEndpoint({ GEMINI_API_ENDPOINT: "  " }), GOOGLE);
    },
    "a loopback override is used outside production (the local stand-in)"() {
      assert.equal(resolveGeminiEndpoint({ GEMINI_API_ENDPOINT: "http://127.0.0.1:3199/v1beta/interactions" }), "http://127.0.0.1:3199/v1beta/interactions");
      assert.equal(resolveGeminiEndpoint({ GEMINI_API_ENDPOINT: "http://localhost:3199/x", NODE_ENV: "development" }), "http://localhost:3199/x");
      assert.equal(resolveGeminiEndpoint({ GEMINI_API_ENDPOINT: "http://[::1]:3199/x", NODE_ENV: "test" }), "http://[::1]:3199/x");
    },
    "in production the override is ignored, loopback or not"() {
      assert.equal(resolveGeminiEndpoint({ GEMINI_API_ENDPOINT: "http://127.0.0.1:3199/x", NODE_ENV: "production" }), GOOGLE);
    },
    "a non-loopback host never receives the key, including look-alike hosts and credential tricks"() {
      for (const bad of [
        "https://evil.example.com/v1beta/interactions",
        "http://localhost.evil.example.com/x",
        "http://127.0.0.1.evil.example.com/x",
        "http://127.0.0.1@evil.example.com/x", // the host here is evil.example.com
        "http://evil.example.com#@127.0.0.1/x",
        "http://10.0.0.5/x",
        "http://0.0.0.0/x",
      ]) {
        assert.equal(resolveGeminiEndpoint({ GEMINI_API_ENDPOINT: bad }), GOOGLE, bad);
      }
    },
    "a loopback address with another scheme, or text that is not a URL, falls back to Google"() {
      for (const bad of ["ftp://127.0.0.1/x", "file:///etc/passwd", "javascript:alert(1)", "not a url", "127.0.0.1:3199"]) {
        assert.equal(resolveGeminiEndpoint({ GEMINI_API_ENDPOINT: bad }), GOOGLE, bad);
      }
    },
  });
}
