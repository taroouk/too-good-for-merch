// ISOLATED-COPY ONLY (installed by run-isolated.mjs --qa-routes). READ-ONLY snapshot of the catalog tables (fabrics, pricing rules, product
// copy, placement prices, store settings) and the audit actions, for end-to-end tests of the admin catalog/pricing pages.
import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.TGFM_FAKE_QA !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [fabrics, rules, placements, settings, audits] = await Promise.all([
    prisma.catalogFabric.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.pricingRule.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.placementPricingRule.findMany().catch(() => []),
    prisma.storeSetting.findUnique({ where: { id: "store" } }),
    prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 50, select: { action: true, newValue: true } }),
  ]);
  return NextResponse.json({ fabrics, rules, placements, settings, audits });
}
