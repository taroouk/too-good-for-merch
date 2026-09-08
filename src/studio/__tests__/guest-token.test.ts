// file: src/studio/__tests__/guest-token.test.ts
import assert from "node:assert/strict";
import { signGuestBuildToken, verifyGuestBuildToken } from "../guest-token";
import { runSuite } from "../../testing/test-harness";

const SECRET = "test-guest-token-secret-at-least-32-chars-long";

export async function runAll() {
  const originalSecret = process.env.NEXTAUTH_SECRET;
  try {
    return await runSuite("studio/guest-token", {
      "a token signed for a build id verifies back to that same id"() {
        process.env.NEXTAUTH_SECRET = SECRET;
        const token = signGuestBuildToken("build-123");
        assert.equal(verifyGuestBuildToken(token), "build-123");
      },

      "a token valid for build A does not verify as access to a different build B"() {
        process.env.NEXTAUTH_SECRET = SECRET;
        const tokenForA = signGuestBuildToken("build-A");
        const verifiedId = verifyGuestBuildToken(tokenForA);
        assert.notEqual(verifiedId, "build-B");
        assert.equal(verifiedId, "build-A");
      },

      "a tampered build id (signature no longer matches) is rejected"() {
        process.env.NEXTAUTH_SECRET = SECRET;
        const token = signGuestBuildToken("build-123");
        const [, signature] = [token.slice(0, token.lastIndexOf(".")), token.slice(token.lastIndexOf(".") + 1)];
        const forged = `build-456.${signature}`;
        assert.equal(verifyGuestBuildToken(forged), null);
      },

      "a raw (unsigned) legacy cookie value is rejected, not treated as a bare build id"() {
        process.env.NEXTAUTH_SECRET = SECRET;
        assert.equal(verifyGuestBuildToken("cm3legacybuildidwithnodot"), null);
      },

      "a token signed with a different secret is rejected"() {
        process.env.NEXTAUTH_SECRET = SECRET;
        const token = signGuestBuildToken("build-123");
        process.env.NEXTAUTH_SECRET = "a-completely-different-secret-value";
        assert.equal(verifyGuestBuildToken(token), null);
      },

      "garbage input is rejected without throwing"() {
        process.env.NEXTAUTH_SECRET = SECRET;
        assert.equal(verifyGuestBuildToken(""), null);
        assert.equal(verifyGuestBuildToken(null), null);
        assert.equal(verifyGuestBuildToken(undefined), null);
        assert.equal(verifyGuestBuildToken("no-dot-at-all"), null);
        assert.equal(verifyGuestBuildToken(".just-a-signature"), null);
      },

      "signing throws a clear error when NEXTAUTH_SECRET is not configured"() {
        delete process.env.NEXTAUTH_SECRET;
        assert.throws(() => signGuestBuildToken("build-123"), /NEXTAUTH_SECRET/);
      },
    });
  } finally {
    if (originalSecret === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = originalSecret;
  }
}
