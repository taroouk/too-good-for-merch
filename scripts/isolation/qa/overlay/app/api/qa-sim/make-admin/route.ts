// ISOLATED-COPY ONLY (installed by run-isolated.mjs --qa-routes). Creates a throwaway ADMIN user in the FAKE database so the
// admin pages can be looked at in a browser. Guarded by TGFM_FAKE_QA, which exists only in that isolated copy.
import { NextResponse } from "next/server";
import argon2 from "argon2";
import { prisma } from "src/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.TGFM_FAKE_QA !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!email || !password || !/@tgfm\.test$/.test(email)) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const passwordHash = await argon2.hash(password);
  const user = await prisma.user.upsert({ where: { email }, create: { email, passwordHash, role: "ADMIN" }, update: { passwordHash, role: "ADMIN", blockedAt: null } });
  return NextResponse.json({ ok: true, id: user.id });
}
