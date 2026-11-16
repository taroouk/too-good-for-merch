// ISOLATED-COPY ONLY (installed by run-isolated.mjs --qa-routes). Tells the test runner whether THIS server holds real Paymob TEST keys
// (a --paymob-sandbox-env run) so it can refuse to run ordinary tests against it (their traces would record checkout URLs), and whether
// it holds anything that looks LIVE. Returns booleans only, never a value. Guarded by TGFM_FAKE_QA.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.TGFM_FAKE_QA !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const sk = process.env.PAYMOB_SECRET_KEY ?? "";
  const pk = process.env.PAYMOB_PUBLIC_KEY ?? "";
  return NextResponse.json({ sandbox: /^egy_sk_test_/.test(sk) && /^egy_pk_test_/.test(pk), live: /_live_/i.test(sk + pk) });
}
