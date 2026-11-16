// ISOLATED-COPY ONLY (installed by run-isolated.mjs --qa-routes). Changes a user's role / blocked state in the FAKE database while
// their session token stays as it was, to simulate "demoted or blocked after signing in". Guarded by TGFM_FAKE_QA. Not part of the app.
import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.TGFM_FAKE_QA !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { email, role, blocked } = (await req.json().catch(() => ({}))) as { email?: string; role?: "USER" | "ADMIN"; blocked?: boolean };
  if (!email || !/@tgfm\.test$/.test(email)) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (role) data.role = role;
  if (typeof blocked === "boolean") data.blockedAt = blocked ? new Date() : null;
  const user = await prisma.user.update({ where: { email }, data });
  return NextResponse.json({ ok: true, role: user.role, blockedAt: user.blockedAt });
}
