// ISOLATED-COPY ONLY (installed by run-isolated.mjs --qa-routes). READ-ONLY: a build's draft id, its asset ids and its current AI mockup
// pointer, so end-to-end tests can call the mockup API directly and check what was persisted. Guarded by TGFM_FAKE_QA.
import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.TGFM_FAKE_QA !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { buildId } = (await req.json().catch(() => ({}))) as { buildId?: string };
  const build = buildId ? await prisma.build.findUnique({ where: { id: buildId }, select: { id: true, userId: true, draft: { select: { id: true, aiMockupId: true, aiMockupFingerprint: true } }, assets: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, status: true, cropSourceAssetId: true, cropMeta: true } } } }) : null;
  if (!build) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const mockups = await prisma.mockup.count({ where: { buildId: build.id } });
  return NextResponse.json({ buildId: build.id, ownerId: build.userId, draftId: build.draft?.id ?? null, aiMockupId: build.draft?.aiMockupId ?? null, aiMockupFingerprint: build.draft?.aiMockupFingerprint ?? null, assets: build.assets, mockupRows: mockups });
}
