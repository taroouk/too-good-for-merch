// file: src/pricing/currency.ts
//
// USD -> payment-currency conversion for order creation. Pulled out of
// src/lib/orders/checkout.ts as pure, DB-free functions so they're
// unit-testable with this repo's dependency-free test harness (see
// src/pricing/__tests__/currency.test.ts) -- checkout.ts itself talks to
// Prisma throughout and can't be unit tested the same way.

// EGP per 1 USD must be a real, admin-configured, positive, finite number.
// False for null/undefined (not configured), 0 or negative (nonsense
// rate), NaN/Infinity (bad input), or any non-number -- checkout must fail
// closed on all of these rather than guess, default, or silently continue.
export function isValidExchangeRate(rate: unknown): rate is number {
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0;
}

// Converts a canonical USD minor-unit amount to the payment currency by a
// single multiplication, rounded once at the end -- callers must round the
// final canonical USD total (and, separately, the subtotal) exactly once
// each, never round intermediate components (tax, shipping, per-item
// amounts) independently and sum the roundings, which would let the
// payment total drift away from usdCents * rate.
export function convertUsdCentsToPaymentCents(usdCents: number, rate: number): number {
  return Math.round(usdCents * rate);
}

export class InvalidExchangeRateInputError extends Error {}

// Parses the /admin/settings exchange-rate field (see
// src/actions/admin-system-actions.ts's updateStoreSettingsAction). Blank
// means "leave unconfigured" -- distinct from present-but-invalid, which
// must reject loudly rather than silently falling back to unconfigured or
// any guessed default. Every form that submits to that action must carry
// this field (even unchanged, via a hidden input) or its submission will be
// read as blank and clear the configured rate -- see the two forms on
// app/admin/settings/page.tsx.
export function parseExchangeRateInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!isValidExchangeRate(parsed)) {
    throw new InvalidExchangeRateInputError("USD → EGP exchange rate must be a positive number.");
  }
  return parsed;
}
