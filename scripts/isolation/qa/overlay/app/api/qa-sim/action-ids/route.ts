// ISOLATED-COPY ONLY (installed by run-isolated.mjs --qa-routes). Maps every exported Server Action name to its id in THIS build, read from
// the build's own server-reference manifest, so a test can call an action that no page form uses. Guarded by TGFM_FAKE_QA.
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.TGFM_FAKE_QA !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const candidates = [path.join(process.cwd(), ".next/server/server-reference-manifest.json"), path.join(process.cwd(), "app/.next/server/server-reference-manifest.json")];
  const file = candidates.find((c) => fs.existsSync(c));
  if (!file) return NextResponse.json({ error: "manifest not found" }, { status: 500 });
  const manifest = JSON.parse(fs.readFileSync(file, "utf8")) as { node: Record<string, { exportedName?: string; filename?: string }> };
  const ids: Record<string, string> = {};
  for (const [id, entry] of Object.entries(manifest.node)) if (entry.exportedName) ids[entry.exportedName] = id;
  return NextResponse.json({ ids });
}
