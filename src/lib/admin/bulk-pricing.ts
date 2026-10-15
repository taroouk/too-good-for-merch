// Pure maths for the admin "adjust all prices" tool. Prices are canonical USD.

export type BulkMode = "percent" | "fixed";

export const MIN_PRICE = 0.01;
const MAX_PERCENT = 500;
const MIN_PERCENT = -90;
const MAX_FIXED = 1000;

export function validateBulkAdjustment(mode: BulkMode, amount: number): string | null {
  if (!Number.isFinite(amount) || amount === 0) return "Enter an amount other than zero.";
  if (mode === "percent" && (amount < MIN_PERCENT || amount > MAX_PERCENT)) {
    return `Percent change must be between ${MIN_PERCENT}% and +${MAX_PERCENT}%.`;
  }
  if (mode === "fixed" && Math.abs(amount) > MAX_FIXED) return `Fixed change can't exceed ${MAX_FIXED} USD either way.`;
  return null;
}

// New price after the adjustment, rounded to cents and never below MIN_PRICE.
export function adjustPrice(price: number, mode: BulkMode, amount: number): number {
  const next = mode === "percent" ? price * (1 + amount / 100) : price + amount;
  return Math.max(MIN_PRICE, Math.round(next * 100) / 100);
}
