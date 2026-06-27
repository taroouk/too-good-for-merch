export type EnvRequirement = {
  name: string;
  requiredInProduction: boolean;
  description: string;
};

export const ENV_REQUIREMENTS: EnvRequirement[] = [
  {
    name: "DATABASE_URL",
    requiredInProduction: true,
    description: "PostgreSQL connection string used by Prisma.",
  },
  {
    name: "NEXTAUTH_URL",
    requiredInProduction: true,
    description: "Canonical HTTPS application URL.",
  },
  {
    name: "NEXTAUTH_SECRET",
    requiredInProduction: true,
    description: "Long random secret used to sign auth tokens.",
  },
  {
    name: "PAYMOB_API_KEY",
    requiredInProduction: true,
    description: "Paymob server API key.",
  },
  {
    name: "PAYMOB_INTEGRATION_ID",
    requiredInProduction: true,
    description: "Paymob card integration ID.",
  },
  {
    name: "PAYMOB_IFRAME_ID",
    requiredInProduction: true,
    description: "Paymob hosted card iframe ID.",
  },
  {
    name: "PAYMOB_HMAC_SECRET",
    requiredInProduction: true,
    description: "Paymob webhook HMAC secret.",
  },
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
