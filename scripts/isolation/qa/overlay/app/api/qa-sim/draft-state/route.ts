// ISOLATED-COPY ONLY (installed by run-isolated.mjs --qa-routes). Reads a build's draft product and admin-quote fields (and can set the
// draft's product, to make a Bespoke/Custom draft without the WhatsApp step), plus how many quote audit rows exist. Guarded by TGFM_FAKE_QA.
import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.TGFM_FAKE_QA !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { buildId, setProduct } = (await req.json().catch(() => ({}))) as { buildId?: string; setProduct?: string };
  if (!buildId) return NextResponse.json({ error: "buildId" }, { status: 400 });
  if (setProduct) await prisma.buildDraft.update({ where: { buildId }, data: { product: setProduct as never } });
  const draft = await prisma.buildDraft.findUnique({ where: { buildId }, select: { product: true, customQuoteUsdCents: true, customQuoteNote: true, customQuotedAt: true, customQuotedByEmail: true } });
  const audits = await prisma.adminAuditLog.count({ where: { action: { in: ["BUILD_QUOTE_SET", "BUILD_QUOTE_CLEARED"] }, metadata: { path: ["buildId"], equals: buildId } } });
  return NextResponse.json({ draft, audits });
}
