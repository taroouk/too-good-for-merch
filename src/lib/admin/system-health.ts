import { PaymentStatus } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import { getPaymobHealth, isEnvConfigured } from "src/lib/admin/paymob-health";
import { getPricingHealth } from "src/lib/admin/pricing-health";
import { compareMigrations, EXPECTED_LATEST_MIGRATION } from "src/lib/admin/expected-migration";

export type HealthLevel = "ok" | "warn" | "fail";
export type HealthCheck = { id: string; label: string; level: HealthLevel; detail: string; href?: string };

const HOUR = 60 * 60 * 1000;

// One place that gathers every operational signal the System health page
// (and, via the failing subset, the dashboard) reports. Each check is
// independent and failure-tolerant: a broken query degrades to a "fail"
// row instead of taking the whole page down.
export async function getSystemHealth(): Promise<{ checks: HealthCheck[]; dbLatencyMs: number | null }> {
  const checks: HealthCheck[] = [];
  const now = Date.now();

  let dbLatencyMs: number | null = null;
  try {
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - started;
    checks.push({ id: "db", label: "Database", level: dbLatencyMs > 1500 ? "warn" : "ok", detail: `Reachable · ${dbLatencyMs} ms round trip` });
  } catch {
    checks.push({ id: "db", label: "Database", level: "fail", detail: "Query failed — the database is unreachable." });
    return { checks, dbLatencyMs };
  }

  // Is the database the one THIS code was written for? A database that is
  // ahead of a still-running older deployment (migrations applied before the
  // new code shipped) makes writes fail -- e.g. no order can be created.
  try {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY migration_name DESC LIMIT 1`;
    const skew = compareMigrations(rows[0]?.migration_name ?? null, EXPECTED_LATEST_MIGRATION);
    checks.push({
      id: "migrations",
      label: "Database migrations",
      level: skew === "ok" ? "ok" : skew === "db-behind" ? "fail" : "warn",
      detail:
        skew === "ok"
          ? `Up to date (${EXPECTED_LATEST_MIGRATION}).`
          : skew === "db-behind"
            ? `The database is BEHIND this deployment (latest applied: ${rows[0]?.migration_name ?? "none"}). Run npm run db:migrate:deploy.`
            : `The database is AHEAD of this deployment (latest applied: ${rows[0]?.migration_name}). Deploy the latest code, or an older server may fail to save orders.`,
    });
  } catch {
    checks.push({ id: "migrations", label: "Database migrations", level: "warn", detail: "Couldn't read the migration history." });
  }

  const required = [
    { name: "NEXTAUTH_SECRET", label: "NextAuth secret" },
    { name: "NEXTAUTH_URL", label: "NextAuth URL" },
    { name: "DATABASE_URL", label: "Database URL" },
  ];
  const missingEnv = required.filter((item) => !isEnvConfigured(item.name));
  checks.push({
    id: "env",
    label: "Core environment",
    level: missingEnv.length ? "fail" : "ok",
    detail: missingEnv.length ? `Missing: ${missingEnv.map((item) => item.name).join(", ")}` : "Auth and database variables are set.",
  });

  const paymob = getPaymobHealth();
  checks.push({
    id: "paymob-config",
    label: "Paymob credentials",
    level: paymob.allConfigured ? "ok" : "fail",
    detail: paymob.allConfigured ? "All required credentials are set." : `Missing: ${paymob.missingRequired.map((item) => item.envVar).join(", ")}`,
    href: "/admin/settings",
  });

  try {
    const [pricing, invalidWebhooks, failedWebhooks, unprocessedWebhooks, stuckPending, newBespoke, activeAdmins, failedCheckouts] = await Promise.all([
      getPricingHealth(),
      prisma.webhookEvent.count({ where: { validSignature: false, createdAt: { gte: new Date(now - 24 * HOUR) } } }),
      prisma.webhookEvent.count({ where: { validSignature: true, processed: false, errorMessage: { not: null }, createdAt: { gte: new Date(now - 72 * HOUR) } } }),
      prisma.webhookEvent.count({ where: { validSignature: true, processed: false, errorMessage: null, createdAt: { lte: new Date(now - 15 * 60 * 1000), gte: new Date(now - 72 * HOUR) } } }),
      prisma.order.count({ where: { paymentStatus: PaymentStatus.PENDING, createdAt: { lte: new Date(now - 24 * HOUR) } } }),
      prisma.bespokeRequest.count({ where: { status: "NEW" } }),
      prisma.user.count({ where: { role: "ADMIN", blockedAt: null } }),
      prisma.adminAuditLog.count({ where: { action: "CHECKOUT_FAILED", createdAt: { gte: new Date(now - 24 * HOUR) } } }),
    ]);

    checks.push({
      id: "checkout-failures",
      label: "Failed checkouts (24h)",
      level: failedCheckouts >= 3 ? "fail" : failedCheckouts > 0 ? "warn" : "ok",
      detail: failedCheckouts
        ? `${failedCheckouts} customer checkout(s) failed before payment — open the audit log (Checkout failed) to see why.`
        : "No failed checkouts.",
      href: "/admin/audit?action=CHECKOUT_FAILED",
    });

    checks.push({
      id: "fx",
      label: "USD → EGP exchange rate",
      level: pricing.usdToEgpRate == null ? "fail" : "ok",
      detail: pricing.usdToEgpRate == null ? "Not configured — checkout will fail." : `1 USD = ${pricing.usdToEgpRate} EGP`,
      href: "/admin/settings",
    });
    checks.push({
      id: "pricing",
      label: "Pricing coverage",
      level: pricing.missingCombos.length ? "warn" : "ok",
      detail: pricing.missingCombos.length ? `${pricing.missingCombos.length} product/fabric combination(s) can't be priced.` : `All ${pricing.coverage.length} combinations are priced.`,
      href: "/admin/pricing",
    });
    checks.push({
      id: "webhook-errors",
      label: "Webhook processing (72h)",
      level: failedWebhooks > 0 ? "fail" : unprocessedWebhooks > 0 ? "warn" : "ok",
      detail: failedWebhooks > 0
        ? `${failedWebhooks} verified webhook(s) failed to process — a paid order may not be marked paid.`
        : unprocessedWebhooks > 0
          ? `${unprocessedWebhooks} verified webhook(s) still unprocessed after 15+ minutes.`
          : "Every verified webhook was processed.",
      href: "/admin/payments",
    });
    checks.push({
      id: "webhook-signatures",
      label: "Rejected webhook signatures (24h)",
      level: invalidWebhooks > 5 ? "warn" : "ok",
      detail: invalidWebhooks ? `${invalidWebhooks} request(s) failed HMAC verification — check the HMAC secret or look for probing.` : "None.",
      href: "/admin/payments",
    });
    checks.push({
      id: "stuck-payments",
      label: "Payments pending over 24h",
      level: stuckPending > 0 ? "warn" : "ok",
      detail: stuckPending ? `${stuckPending} order(s) are still pending — verify with Paymob or send a retry link.` : "None.",
      href: "/admin/payments",
    });
    checks.push({
      id: "bespoke",
      label: "Unanswered bespoke requests",
      level: newBespoke > 0 ? "warn" : "ok",
      detail: newBespoke ? `${newBespoke} new request(s) haven't been contacted yet.` : "Inbox is clear.",
      href: "/admin/bespoke",
    });
    checks.push({
      id: "admins",
      label: "Active admins",
      level: activeAdmins < 2 ? "warn" : "ok",
      detail: activeAdmins < 2 ? "Only one active admin — add a second so you can't be locked out." : `${activeAdmins} active admins.`,
      href: "/admin/team",
    });
  } catch {
    checks.push({ id: "queries", label: "Operational checks", level: "fail", detail: "Some health queries failed — check server logs." });
  }

  return { checks, dbLatencyMs };
}
