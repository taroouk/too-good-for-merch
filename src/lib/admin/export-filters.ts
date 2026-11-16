// Query-string filters for the admin order export. They come straight from the URL, so every value must be turned into something the
// database accepts or dropped: an impossible date ("9999-99-99") became `Invalid Date` and a huge amount overflowed the Int column, and
// both reached Prisma and ended as a 500 instead of simply being ignored.

const INT32_MAX = 2_147_483_647;

// "YYYY-MM-DD" that is a real calendar day; anything else is ignored.
export function exportDate(value: string, endOfDay: boolean): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  if (date.toISOString().slice(0, 10) !== value) return undefined; // "2026-02-31" rolls over to March: not a real day
  return date;
}

// A money amount typed in whole currency units -> integer cents that fit the database column; anything unusable is ignored.
export function exportCents(raw: string): number | undefined {
  if (!raw.trim()) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || cents > INT32_MAX || cents < -INT32_MAX) return undefined;
  return cents;
}
