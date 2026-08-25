import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";
import {
  getProductionEnvStatus,
  publicRuntimeConfigWarnings,
} from "src/lib/production-readiness";

export const runtime = "nodejs";

export async function GET() {
  const env = getProductionEnvStatus();
  let database = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "error";
  }

  const ok = env.ok && database === "ok";

  // Which specific secrets are missing is only useful to operators and is
  // otherwise information an attacker could use to time attacks (e.g. a
  // missing webhook HMAC secret). Only reveal those details to an
  // authenticated admin; unauthenticated callers get a plain ok/not-ok.
  const session = await auth();
  const isAdmin = session?.user?.role === Role.ADMIN;

  return NextResponse.json(
    {
      ok,
      service: "too-good-for-merch",
      timestamp: new Date().toISOString(),
      checks: {
        database,
        env: isAdmin
          ? { ok: env.ok, missing: env.missing, warnings: publicRuntimeConfigWarnings() }
          : { ok: env.ok },
      },
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
