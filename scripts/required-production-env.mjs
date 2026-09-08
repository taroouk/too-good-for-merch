// Single source of truth for which env vars are mandatory in production.
// Consumed by both scripts/check-production-env.mjs (pre-build CLI check)
// and src/lib/production-readiness.ts (runtime instrumentation check) so
// the two never drift out of sync with each other.
export const REQUIRED_PRODUCTION_ENV = [
  "DATABASE_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "PAYMOB_API_KEY",
  "PAYMOB_INTEGRATION_ID",
  "PAYMOB_IFRAME_ID",
  "PAYMOB_HMAC_SECRET",
];
