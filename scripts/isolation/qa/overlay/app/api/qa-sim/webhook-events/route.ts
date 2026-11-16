// ISOLATED-COPY ONLY (installed by run-isolated.mjs --qa-routes). READ-ONLY listing of the WebhookEvent rows in the fake database
// (what was stored, how big, whether it was marked rejected) so the QA scripts can check that rejected requests are not persisted
// with their payload. Not part of the application.
import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";
import { getUserId } from "src/studio/authz";

export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.TGFM_FAKE_QA !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const rows = await prisma.webhookEvent.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({
    events: rows.map((row) => ({
      eventKey: row.eventKey,
      eventType: row.eventType,
      validSignature: row.validSignature,
      processed: row.processed,
      errorMessage: row.errorMessage,
      payloadBytes: JSON.stringify(row.payload ?? null).length,
    })),
  });
}
