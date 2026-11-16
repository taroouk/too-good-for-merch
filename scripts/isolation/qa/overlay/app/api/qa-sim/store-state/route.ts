// ISOLATED-COPY ONLY (installed by run-isolated.mjs --qa-routes). Reads (and can reset) the store's display currency and USD->EGP rate, and
// counts the display-currency audit rows. Guarded by TGFM_FAKE_QA.
import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.TGFM_FAKE_QA !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { displayCurrency?: string; usdToEgpRate?: number | null };
  const data: Record<string, unknown> = {};
  if (body.displayCurrency) data.displayCurrency = body.displayCurrency;
  if (body.usdToEgpRate !== undefined) data.usdToEgpRate = body.usdToEgpRate;
  if (Object.keys(data).length) await prisma.storeSetting.upsert({ where: { id: "store" }, update: data, create: { id: "store", ...data } });
  const setting = await prisma.storeSetting.findUnique({ where: { id: "store" }, select: { displayCurrency: true, usdToEgpRate: true } });
  const audits = await prisma.adminAuditLog.count({ where: { action: "DISPLAY_CURRENCY_UPDATED" } });
  return NextResponse.json({ setting, audits });
}
