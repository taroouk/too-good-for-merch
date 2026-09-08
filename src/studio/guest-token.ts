// file: src/studio/guest-token.ts
//
// P2-4: the guest-build cookie used to be the raw Build.id, verbatim.
// Build.id already appears in the page URL (/studio/projects/[id]/builder),
// so anyone who learns another guest's build id (a shared link, a support
// screenshot, a leaked Referer header, server logs) could set that exact
// string as their own cookie and gain full guest access to that build --
// no additional secret required. Signing the id with an HMAC turns the
// cookie into something that can't be forged from the id alone: the id is
// still visible in the URL, but a valid signature can only be produced by
// this server. Verification is a pure computation (constant-time compare),
// no DB round trip and no new column/table.
import { createHmac, timingSafeEqual } from "node:crypto";

function guestTokenSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET must be set to sign/verify guest build tokens.");
  }
  return secret;
}

function sign(buildId: string): string {
  return createHmac("sha256", guestTokenSecret()).update(buildId).digest("base64url");
}

export function signGuestBuildToken(buildId: string): string {
  return `${buildId}.${sign(buildId)}`;
}

// Returns the build id embedded in the token only if the signature is
// genuinely valid for that id; otherwise null. Deliberately does not fall
// back to treating an unsigned/legacy value as a bare build id -- that
// would just reopen the forgeable-cookie hole this replaces. Any
// previously-issued raw-id cookie stops validating and the holder is
// redirected to start a fresh (signed) guest build, same path already used
// for "build not found" (see assertBuildAccess in src/studio/permissions.ts).
export function verifyGuestBuildToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const separatorIndex = token.lastIndexOf(".");
  if (separatorIndex <= 0) return null;

  const buildId = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);

  let expected: Buffer;
  let received: Buffer;
  try {
    expected = Buffer.from(sign(buildId));
    received = Buffer.from(signature);
  } catch {
    return null;
  }
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null;
  }
  return buildId;
}
