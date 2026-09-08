// file: src/lib/admin/access.ts
//
// Pure, DB-free admin-access DECISION logic (P1-9), split out of
// src/lib/admin/auth.ts's requireAdmin() specifically so it can be unit
// tested without a Prisma-dependent test harness -- this repo's test
// runners (scripts/run-payments-tests.mjs) compile a hand-picked, Prisma
// import-free subset of modules with plain tsc, the same pattern
// src/lib/admin/currency-aggregates.ts already uses to make otherwise
// Prisma-coupled admin logic testable.
//
// This function is intentionally the ONLY place that decides "is this
// user allowed into the admin area" -- requireAdmin() below just fetches
// the row and defers to this. It takes a plain data shape (not a Prisma
// model instance), so a test can hand it a bare object shaped like `{
// role, blockedAt }` without ever touching Prisma or a database.
import type { Role } from "@prisma/client";

export type AdminAccessRecord = {
  role: Role | string;
  blockedAt: Date | string | null;
};

// Case A: ADMIN, not blocked -> allow.
// Case B: role changed away from ADMIN (e.g. demoted to USER) -> deny.
// Case C: ADMIN but blockedAt is set -> deny.
// Case D: plain USER (never was ADMIN) -> deny.
// A missing/null record (no such user, or not logged in) -> deny.
export function isAdminAccessAllowed(user: AdminAccessRecord | null | undefined): boolean {
  if (!user) return false;
  if (user.role !== "ADMIN") return false;
  if (user.blockedAt) return false;
  return true;
}
