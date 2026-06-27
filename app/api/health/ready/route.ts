import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";
import {
  getProductionEnvStatus,
  publicRuntimeConfigWarnings,
} from "src/lib/production-readiness";

export const runtime = "nodejs";

export async function GET() {
  const env = getProductionEnvStatus();
  const warnings = publicRuntimeConfigWarnings();
  let database = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "error";
  }

  const ok = env.ok && database === "ok";

  return NextResponse.json(
    {
      ok,
      service: "too-good-for-merch",
      timestamp: new Date().toISOString(),
      checks: {
        database,
        env: {
          ok: env.ok,
          missing: env.missing,
          warnings,
        },
      },
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
