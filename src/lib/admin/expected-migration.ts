// The newest Prisma migration this build of the code was written against.
// System health compares it with what the database has actually applied, so a
// database that is AHEAD of (or BEHIND) the running deployment is flagged
// instead of silently breaking checkout. A unit test fails whenever a new
// folder appears in prisma/migrations without this being updated.
export const EXPECTED_LATEST_MIGRATION = "20261015100000_store_display_currency";

export type MigrationSkew = "ok" | "db-behind" | "db-ahead";

// Migration names start with a sortable timestamp, so plain string order works.
export function compareMigrations(appliedLatest: string | null, expected: string): MigrationSkew {
  if (!appliedLatest) return "db-behind";
  if (appliedLatest === expected) return "ok";
  return appliedLatest < expected ? "db-behind" : "db-ahead";
}
