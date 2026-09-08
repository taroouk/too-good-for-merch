// file: src/studio/mockup-staleness.ts

// P3-21a: a persisted mockup whose fingerprint is null has unknown
// provenance (legacy rows written before fingerprints were stamped). It must
// count as stale rather than fresh -- treating it as fresh both suppressed
// the stale badge and hid the regenerate action, leaving the user with an
// unverifiable image and no way to refresh it.
export function isMockupStale(input: {
  url: string | null;
  fingerprint: string | null;
  liveFingerprint: string;
}): boolean {
  if (!input.url) return false;
  if (!input.fingerprint) return true;
  return input.fingerprint !== input.liveFingerprint;
}
