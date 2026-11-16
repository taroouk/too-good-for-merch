// file: src/lib/auth/__tests__/safe-redirect.test.ts
//
// Regression: /login?callbackUrl=https://evil.example sent a freshly signed-in customer to the attacker's site (found by the browser
// end-to-end run: the page really navigated to the external URL).
import assert from "node:assert/strict";
import { safeCallbackPath, safeResultPath } from "../safe-redirect";
import { runSuite } from "../../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/auth/safe-redirect", {
    "ordinary same-site paths are kept (with query and hash)"() {
      assert.equal(safeCallbackPath("/orders"), "/orders");
      assert.equal(safeCallbackPath("/studio/projects/abc/builder?x=1#top"), "/studio/projects/abc/builder?x=1#top");
      assert.equal(safeCallbackPath("/checkout?cart=1"), "/checkout?cart=1");
    },
    "absolute URLs, protocol-relative URLs and other schemes fall back"() {
      for (const bad of ["https://evil.example/phish", "http://evil.example", "//evil.example", "///evil.example", "/\\evil.example", "\\\\evil.example", "javascript:alert(1)", "data:text/html,x", "ftp://x", "evil.example", "orders"]) {
        assert.equal(safeCallbackPath(bad), "/studio", bad);
      }
    },
    "control characters, backslashes, tabs and newlines (parser tricks) fall back"() {
      for (const bad of ["/ok\n//evil.example", "/\t/evil.example", "/ok\\..\\evil", "/\u0000", "/\r\nLocation: x"]) assert.equal(safeCallbackPath(bad), "/studio", JSON.stringify(bad));
    },
    "non-strings, empty and oversized values fall back; the fallback is configurable"() {
      for (const bad of [undefined, null, 5, {}, [], "", "   ", "/" + "a".repeat(2000)]) assert.equal(safeCallbackPath(bad), "/studio");
      assert.equal(safeCallbackPath("https://evil.example", "/orders"), "/orders");
    },
    "the sign-in result URL is accepted only for our own origin"() {
      assert.equal(safeResultPath("http://localhost:3000/orders?a=1", "http://localhost:3000", "/studio"), "/orders?a=1");
      assert.equal(safeResultPath("https://evil.example/x", "http://localhost:3000", "/studio"), "/studio");
      assert.equal(safeResultPath("//evil.example/x", "http://localhost:3000", "/studio"), "/studio");
      assert.equal(safeResultPath(null, "http://localhost:3000", "/studio"), "/studio");
      assert.equal(safeResultPath("/relative", "http://localhost:3000", "/studio"), "/relative");
    },
  });
}
