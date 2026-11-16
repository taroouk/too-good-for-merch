// file: src/lib/auth/safe-redirect.ts
//
// Where may the sign-in / sign-up pages send the customer afterwards? The `callbackUrl` query parameter is attacker-controllable
// (a link can be crafted to /login?callbackUrl=https://evil.example), so only a plain same-site path is ever followed. Pure so it can be
// unit tested; the login and register clients use it for every redirect.
export function safeCallbackPath(candidate: unknown, fallback = "/studio"): string {
  if (typeof candidate !== "string") return fallback;
  const value = candidate.trim();
  if (!value || value.length > 1000) return fallback;
  // must be a single-slash path: "//host", "/\host", "\\host", "https://host", "javascript:..." and anything with control characters are refused
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  // a path that, once parsed, would leave this site (e.g. "/%2F%2Fevil.example" is fine as text, but "/@evil" style tricks are checked by parsing)
  try {
    const parsed = new URL(value, "http://tgfm.local");
    if (parsed.origin !== "http://tgfm.local") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

// signIn() may hand back an absolute URL of our own origin; reduce whatever it returns to a safe path as well.
export function safeResultPath(resultUrl: string | null | undefined, ownOrigin: string, fallback: string): string {
  if (!resultUrl) return fallback;
  try {
    const parsed = new URL(resultUrl, ownOrigin);
    if (parsed.origin !== ownOrigin) return fallback;
    return safeCallbackPath(`${parsed.pathname}${parsed.search}${parsed.hash}`, fallback);
  } catch {
    return fallback;
  }
}
