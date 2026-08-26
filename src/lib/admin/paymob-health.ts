// Server-only: reads env var *presence*, never a value, and never returns
// one -- both Settings (the credentials checklist) and the Dashboard
// (operational alerts) call this instead of keeping two copies of the
// credential list in sync.
export const PAYMOB_CREDENTIALS = [
  { label: "API key", envVar: "PAYMOB_API_KEY", required: true },
  { label: "Card integration", envVar: "PAYMOB_INTEGRATION_ID", required: true },
  { label: "Card iframe", envVar: "PAYMOB_IFRAME_ID", required: true },
  { label: "HMAC secret", envVar: "PAYMOB_HMAC_SECRET", required: true },
  { label: "Wallet integration", envVar: "PAYMOB_WALLET_INTEGRATION_ID", required: false },
] as const;

export function isEnvConfigured(name: string) {
  return Boolean(process.env[name]?.trim());
}

export function getPaymobHealth() {
  const items = PAYMOB_CREDENTIALS.map((credential) => ({ ...credential, configured: isEnvConfigured(credential.envVar) }));
  const missingRequired = items.filter((item) => item.required && !item.configured);
  return { items, missingRequired, allConfigured: missingRequired.length === 0 };
}
