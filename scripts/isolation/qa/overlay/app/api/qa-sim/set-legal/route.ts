// ISOLATED-COPY ONLY (installed by run-isolated.mjs --qa-routes). Simulates an admin editing the Terms / Refund page, which
// changes the revision stamp customers' consent is compared against. Fake database only.
import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";
import { getUserId } from "src/studio/authz";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.TGFM_FAKE_QA !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await getUserId())) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { slug, body } = (await req.json().catch(() => ({}))) as { slug?: string; body?: string };
  if (slug !== "terms" && slug !== "refunds") return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  await prisma.legalPage.upsert({
    where: { slug },
    create: { slug, title: slug, body: body ?? "edited", updatedByEmail: "qa@test.invalid" },
    update: { body: body ?? "edited", updatedByEmail: "qa@test.invalid" },
  });
  return NextResponse.json({ ok: true });
}
