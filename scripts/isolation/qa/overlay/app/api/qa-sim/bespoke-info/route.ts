// ISOLATED-COPY ONLY (installed by run-isolated.mjs --qa-routes). READ-ONLY: the Bespoke requests of one customer address with their
// stored snapshot fields, notes and the audit actions, so end-to-end tests can check what the database holds. Guarded by TGFM_FAKE_QA.
import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.TGFM_FAKE_QA !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { email, buildId } = (await req.json().catch(() => ({}))) as { email?: string; buildId?: string };
  const requests = await prisma.bespokeRequest.findMany({
    where: { ...(email ? { customerEmail: email } : {}), ...(buildId ? { buildId } : {}) },
    orderBy: { createdAt: "asc" },
  });
  const draft = buildId ? await prisma.buildDraft.findFirst({ where: { buildId }, select: { product: true, customQuoteUsdCents: true, customQuoteNote: true } }) : null;
  const audits = await prisma.adminAuditLog.findMany({ where: { OR: [{ bespokeRequestId: { in: requests.map((r) => r.id) } }, ...(buildId ? [{ metadata: { path: ["buildId"], equals: buildId } }] : [])] } }).catch(() => []);
  return NextResponse.json({ requests, draft, audits: audits.map((a) => ({ action: a.action, newValue: a.newValue })) });
}
