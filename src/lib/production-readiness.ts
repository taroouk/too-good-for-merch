import { REQUIRED_PRODUCTION_ENV } from "../../scripts/required-production-env.mjs";

export type EnvRequirement = {
  name: string;
  requiredInProduction: boolean;
  description: string;
};

// Descriptions live here (display-only); the names themselves come from
// scripts/required-production-env.mjs so this list and the pre-build CLI
// check (scripts/check-production-env.mjs) can never drift apart.
const REQUIRED_DESCRIPTIONS: Record<string, string> = {
  DATABASE_URL: "PostgreSQL connection string used by Prisma.",
  NEXTAUTH_URL: "Canonical HTTPS application URL.",
  NEXTAUTH_SECRET: "Long random secret used to sign auth tokens.",
  PAYMOB_API_KEY: "Paymob server API key.",
  PAYMOB_INTEGRATION_ID: "Paymob card integration ID.",
  PAYMOB_IFRAME_ID: "Paymob hosted card iframe ID.",
  PAYMOB_HMAC_SECRET: "Paymob webhook HMAC secret.",
};

export const ENV_REQUIREMENTS: EnvRequirement[] = [
  ...REQUIRED_PRODUCTION_ENV.map((name) => ({
    name,
    requiredInProduction: true as const,
    description: REQUIRED_DESCRIPTIONS[name] ?? "",
  })),
  {
    name: "ADMIN_EMAILS",
    requiredInProduction: false,
    description: "Comma-separated bootstrap admin email list.",
  },
  {
    name: "PAYMOB_WALLET_INTEGRATION_ID",
    requiredInProduction: false,
    description: "Optional Paymob mobile wallet integration ID.",
  },
  {
    name: "STORE_CURRENCY",
    requiredInProduction: false,
    description: "Fallback ISO currency code when store settings are empty.",
  },
  {
    name: "NEXT_PUBLIC_WHATSAPP_PHONE",
    requiredInProduction: false,
    description: "Public WhatsApp contact phone in international digits.",
  },
  {
    name: "NEXT_PUBLIC_WHATSAPP_MESSAGE",
    requiredInProduction: false,
    description: "Public default WhatsApp message.",
  },
  {
    name: "NEXT_PUBLIC_CONTACT_EMAIL",
    requiredInProduction: false,
    description: "Public contact email address.",
  },
  {
    name: "NEXT_PUBLIC_INSTAGRAM_URL",
    requiredInProduction: false,
    description: "Public Instagram profile URL.",
  },
  {
    name: "NEXT_PUBLIC_TIKTOK_URL",
    requiredInProduction: false,
    description: "Public TikTok profile URL.",
  },
];

export function getProductionEnvStatus() {
  const entries = ENV_REQUIREMENTS.map((requirement) => {
    const configured = Boolean(process.env[requirement.name]?.trim());
    return { ...requirement, configured };
  });
  const missing = entries
    .filter((entry) => entry.requiredInProduction && !entry.configured)
    .map((entry) => entry.name);

  return {
    ok: missing.length === 0,
    missing,
    entries,
  };
}

export function publicRuntimeConfigWarnings() {
  const warnings: string[] = [];
  const nextAuthUrl = process.env.NEXTAUTH_URL?.trim();
  const nextAuthSecret = process.env.NEXTAUTH_SECRET?.trim();
  const storeCurrency = process.env.STORE_CURRENCY?.trim();

  if (nextAuthUrl) {
    try {
      const parsed = new URL(nextAuthUrl);
      if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
        warnings.push("NEXTAUTH_URL should use https:// in production.");
      }
      if (process.env.NODE_ENV === "production" && parsed.hostname === "localhost") {
        warnings.push("NEXTAUTH_URL should not point to localhost in production.");
      }
    } catch {
      warnings.push("NEXTAUTH_URL is not a valid URL.");
    }
  }

  if (nextAuthSecret && nextAuthSecret.length < 32) {
    warnings.push("NEXTAUTH_SECRET should be at least 32 characters.");
  }

  if (storeCurrency && !/^[A-Z]{3}$/i.test(storeCurrency)) {
    warnings.push("STORE_CURRENCY should be a 3-letter ISO currency code.");
  }

  return warnings;
}
