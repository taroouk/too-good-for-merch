// Customer-facing price display. Canonical pricing and order accounting stay
// USD (src/pricing/engine.ts); the admin can choose to SHOW customers EGP
// instead. EGP is USD x the admin-set exchange rate -- the same conversion
// checkout charges with (src/lib/orders/totals.ts) -- so the price on the page
// and the amount Paymob charges agree. Pure and DB-free so it is unit tested.
import { isValidExchangeRate } from "./currency";

export const DISPLAY_CURRENCIES = ["USD", "EGP"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

// What the storefront actually uses: a currency and the USD -> currency rate
// (1 for USD).
export type StoreDisplay = { currency: DisplayCurrency; rate: number };

export const USD_DISPLAY: StoreDisplay = { currency: "USD", rate: 1 };

export function parseDisplayCurrency(value: unknown): DisplayCurrency {
  const upper = typeof value === "string" ? value.trim().toUpperCase() : "";
  return (DISPLAY_CURRENCIES as readonly string[]).includes(upper) ? (upper as DisplayCurrency) : "USD";
}

// EGP only counts when a usable rate exists; otherwise fall back to USD
// rather than show a made-up number (checkout fails closed the same way).
export function effectiveDisplay(setting: unknown, usdToEgpRate: unknown): StoreDisplay {
  // Customers see EGP automatically whenever a usable rate is configured; the
  // stored display-currency setting no longer switches them back to USD.
  void setting;
  if (isValidExchangeRate(usdToEgpRate)) {
    return { currency: "EGP", rate: usdToEgpRate };
  }
  return USD_DISPLAY;
}

// USD amount -> display amount. Rounds the USD figure to cents first, then
// EGP to a whole pound once, exactly like checkout does.
export function convertForDisplay(usdAmount: number, display: StoreDisplay): number {
  if (display.currency === "USD") return Math.round(usdAmount * 100) / 100;
  return Math.round((Math.round(usdAmount * 100) * display.rate) / 100);
}

// Customer-facing price text: EGP is whole pounds with no decimals
// ("EGP 525"); USD keeps cents ("USD 9.93").
export function formatCurrencyAmount(amount: number, currency: string): string {
  if (currency === "EGP") return `EGP ${Math.round(amount).toLocaleString("en-US")}`;
  return `${currency} ${amount.toFixed(2)}`;
}

export function formatDisplayPrice(usdAmount: number, display: StoreDisplay): string {
  return formatCurrencyAmount(convertForDisplay(usdAmount, display), display.currency);
}

// Same, for an amount already in minor units of `currency` (order totals).
export function formatMinorPrice(minor: number, currency: string): string {
  return formatCurrencyAmount(minor / 100, currency);
}
