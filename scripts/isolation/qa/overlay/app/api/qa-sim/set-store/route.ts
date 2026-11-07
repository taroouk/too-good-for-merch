// ISOLATED-COPY ONLY (installed by run-isolated.mjs --qa-routes). Changes tax/shipping of the FAKE store setting so
// the totals can be exercised with non-zero fees. Not an admin API; the fake database only.
import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";
import { getUserId } from "src/studio/authz";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.TGFM_FAKE_QA !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await getUserId())) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { taxRateBps?: number; shippingCents?: number; usdToEgpRate?: number };
  const data: Record<string, number> = {};
  for (const key of ["taxRateBps", "shippingCents"] as const) if (Number.isInteger(body[key]) && (body[key] as number) >= 0) data[key] = body[key] as number;
  if (typeof body.usdToEgpRate === "number" && body.usdToEgpRate > 0) data.usdToEgpRate = body.usdToEgpRate;
  await prisma.storeSetting.update({ where: { id: "store" }, data });
  return NextResponse.json({ ok: true });
}
