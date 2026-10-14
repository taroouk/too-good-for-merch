// dotenv never overwrites a var that's already set in process.env, so this
// is a no-op on Vercel (which injects real env vars directly) and only
// helps when running this check by hand against local .env files.
//
// A plain `import "dotenv/config"` only ever reads `.env`, but `next build`
// (which this check gates, via the build:production script) actually loads
// -- in order of decreasing priority -- `.env.production.local`,
// `.env.local`, `.env.production`, then `.env` (see Next.js's documented
// env file load order). Only loading `.env` here meant this check could
// pass or fail based on stale/incomplete `.env` contents while the actual
// build picked up different, overriding values from `.env.local` or
// `.env.production.local` -- see P3-21j -- P3-21i. Loading the same files in
// the same precedence order (each `config()` call only fills in vars not
// already set, so the first file loaded wins) makes this check see exactly
// what `next build` would see.
import { config as loadEnv } from "dotenv";

for (const file of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  loadEnv({ path: file });
}

import { REQUIRED_PRODUCTION_ENV as REQUIRED } from "./required-production-env.mjs";

const missing = REQUIRED.filter((name) => !process.env[name]?.trim());
const errors = [];
const warnings = [];

if (missing.length > 0) {
  errors.push(`Missing required production env vars: ${missing.join(", ")}`);
}

const nextAuthUrl = process.env.NEXTAUTH_URL?.trim();
if (nextAuthUrl) {
  try {
    const parsed = new URL(nextAuthUrl);
    if (parsed.protocol !== "https:") {
      errors.push("NEXTAUTH_URL must use https:// for production.");
    }
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      errors.push("NEXTAUTH_URL must not point to localhost for production.");
    }
  } catch {
    errors.push("NEXTAUTH_URL is not a valid URL.");
  }
}

const nextAuthSecret = process.env.NEXTAUTH_SECRET?.trim();
if (nextAuthSecret && nextAuthSecret.length < 32) {
  errors.push("NEXTAUTH_SECRET must be at least 32 characters.");
}

const storeCurrency = process.env.STORE_CURRENCY?.trim();
if (storeCurrency && !/^[A-Z]{3}$/i.test(storeCurrency)) {
  warnings.push("STORE_CURRENCY should be a 3-letter ISO currency code.");
}

// Email is now load-bearing: order confirmations and password-reset links
// (src/lib/notify/email.ts) are only delivered when Resend is configured.
if (!process.env.RESEND_API_KEY?.trim()) {
  warnings.push("RESEND_API_KEY is not set: customers will NOT receive order confirmation or password-reset emails.");
} else if (!process.env.EMAIL_FROM?.trim() || /onboarding@resend\.dev/i.test(process.env.EMAIL_FROM)) {
  warnings.push("EMAIL_FROM should be an address on a domain verified in Resend; the default onboarding@resend.dev can only deliver to the Resend account owner.");
}
if (!process.env.NEXT_PUBLIC_APP_URL?.trim() && !process.env.NEXTAUTH_URL?.trim()) {
  warnings.push("Set NEXT_PUBLIC_APP_URL (or NEXTAUTH_URL): it is used to build the links inside emails.");
}

if (errors.length > 0) {
  console.error("Production environment check failed:");
  for (const error of errors) console.error(`- ${error}`);
  if (warnings.length > 0) {
    console.error("Warnings:");
    for (const warning of warnings) console.error(`- ${warning}`);
  }
  process.exit(1);
}

console.log("Production environment check passed.");
if (warnings.length > 0) {
  console.log("Warnings:");
  for (const warning of warnings) console.log(`- ${warning}`);
}
