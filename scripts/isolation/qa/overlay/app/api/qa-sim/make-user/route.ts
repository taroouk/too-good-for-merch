// ISOLATED-COPY ONLY (installed by run-isolated.mjs --qa-routes). Creates an ordinary USER directly in the test database so end-to-end
// tests need not go through the rate-limited public signup (5 per 10 minutes per IP) for every test. Guarded by TGFM_FAKE_QA.
import { NextResponse } from "next/server";
import argon2 from "argon2";
import { prisma } from "src/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.TGFM_FAKE_QA !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!email || !password || !/@tgfm\.test$/.test(email)) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.user.upsert({ where: { email }, create: { email, passwordHash, role: "USER" }, update: { passwordHash, role: "USER", blockedAt: null } });
  return NextResponse.json({ ok: true, id: user.id });
}
