// Single source of truth for which env vars are mandatory in production.
// Consumed by both scripts/check-production-env.mjs (pre-build CLI check)
// and src/lib/production-readiness.ts (runtime instrumentation check) so
// the two never drift out of sync with each other.
export const REQUIRED_PRODUCTION_ENV = [
  "DATABASE_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "PAYMOB_INTEGRATION_ID",
  "PAYMOB_HMAC_SECRET",
];

// Paymob has two ways to start a payment; one COMPLETE set is required (src/lib/payments/paymob.ts paymobFlow()):
//   - Payment Intention + Unified Checkout (current Paymob checkout): secret key + public key;
//   - Accept hosted iframe (legacy): API key + iframe id.
// PAYMOB_API_KEY is additionally what admin refunds use, in either flow.
export const PAYMOB_CREDENTIAL_SETS = [
  ["PAYMOB_SECRET_KEY", "PAYMOB_PUBLIC_KEY"],
  ["PAYMOB_API_KEY", "PAYMOB_IFRAME_ID"],
];

// Returns null when one complete set is configured, otherwise a message naming what is missing.
export function missingPaymobCredentials(env = process.env) {
  const complete = PAYMOB_CREDENTIAL_SETS.some((set) => set.every((name) => Boolean(env[name]?.trim())));
  if (complete) return null;
  return PAYMOB_CREDENTIAL_SETS.map((set) => set.join(" + ")).join("  OR  ");
}
