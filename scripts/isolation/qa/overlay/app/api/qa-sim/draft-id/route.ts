// ISOLATED-COPY ONLY (installed by run-isolated.mjs --qa-routes). READ-ONLY: the id of a build's draft in the FAKE database, so a
// QA script can name another user's draft in a request. Guarded by TGFM_FAKE_QA. Not part of the application.
import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.TGFM_FAKE_QA !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { buildId } = (await req.json().catch(() => ({}))) as { buildId?: string };
  const draft = buildId ? await prisma.buildDraft.findFirst({ where: { buildId }, select: { id: true, aiMockupId: true } }) : null;
  return NextResponse.json({ draftId: draft?.id ?? null, aiMockupId: draft?.aiMockupId ?? null });
}
