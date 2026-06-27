const REQUIRED = [
  "DATABASE_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "PAYMOB_API_KEY",
  "PAYMOB_INTEGRATION_ID",
  "PAYMOB_IFRAME_ID",
  "PAYMOB_HMAC_SECRET",
];

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
