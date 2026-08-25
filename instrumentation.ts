// Runs once per server instance, before any request is handled (Next.js
// instrumentation hook: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation).
// Used here to fail fast on missing payment/auth configuration instead of
// letting checkout fail later with an opaque 401/undefined error.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getProductionEnvStatus, publicRuntimeConfigWarnings } = await import(
    "src/lib/production-readiness"
  );

  const env = getProductionEnvStatus();
  if (process.env.NODE_ENV === "production" && !env.ok) {
    throw new Error(
      `Refusing to start: missing required production environment variable(s): ${env.missing.join(", ")}. ` +
        "See .env.example for the full list of required checkout/payment configuration.",
    );
  }

  for (const warning of publicRuntimeConfigWarnings()) {
    console.warn(`[env] ${warning}`);
  }

  if (!env.ok) {
    console.warn(
      `[env] Missing (non-production) environment variable(s): ${env.missing.join(", ")}. Checkout/payment routes will fail until these are set.`,
    );
  }
}
