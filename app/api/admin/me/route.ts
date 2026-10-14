import { NextResponse } from "next/server";
import { getAdminUser } from "src/lib/admin/auth";

// Used by /admin/login right after sign-in to confirm the account really is
// an active admin (DB-checked) before sending the user into the dashboard.
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ ok: false }, { status: 403, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
