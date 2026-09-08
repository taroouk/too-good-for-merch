// file: src/lib/auth/bootstrap-role.ts
//
// Pure, DB-free helpers for the register route's ADMIN_EMAILS bootstrap
// decision (see app/api/auth/register/route.ts) -- split out so this
// security-relevant decision is unit-testable with this repo's
// dependency-free test harness.

export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// P1-10: ADMIN_EMAILS is a one-time bootstrap allowlist for the very first
// deploy, not a standing grant. It may mint ADMIN only when no ADMIN
// account exists anywhere yet -- once one does, every later registration,
// even one matching the allowlist, must fall back to USER. Otherwise
// anyone who learns (or guesses) an address in ADMIN_EMAILS could
// permanently self-provision admin access after launch.
export function resolveBootstrapRole(
  matchesAdminAllowlist: boolean,
  adminAlreadyExists: boolean,
): "ADMIN" | "USER" {
  if (!matchesAdminAllowlist) return "USER";
  return adminAlreadyExists ? "USER" : "ADMIN";
}
