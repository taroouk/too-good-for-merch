import type { FullConfig } from "@playwright/test";

// Safety gate for servers that hold real Paymob TEST keys (started with run-isolated.mjs --paymob-sandbox-env):
//  - a server that looks LIVE is never used, whatever the run says;
//  - E2E_PAYMOB_SANDBOX=1 is accepted only together with a sandbox server (never on an ordinary one);
//  - a sandbox server is used only by a run that declares itself a sandbox run (E2E_PAYMOB_SANDBOX=1). Such a run has traces switched off in
//    playwright.config.ts, because a trace stores every request in full, checkout URLs (public key, client secret) included. An ordinary test
//    pointed at that server by mistake would otherwise leave exactly those traces behind.
export default async function globalSetup(config: FullConfig) {
  const base = process.env.E2E_BASE_URL ?? config.projects[0]?.use?.baseURL ?? "http://localhost:3100";
  let mode: { sandbox?: boolean; live?: boolean } | null = null;
  try {
    const res = await fetch(new URL("/api/qa-sim/paymob-mode", base), { signal: AbortSignal.timeout(5000) });
    if (res.ok) mode = await res.json();
  } catch { /* no server yet, or no QA routes: nothing to protect */ }
  if (mode?.live) throw new Error(`REFUSED: ${base} holds what looks like a LIVE Paymob key. Nothing is run against it.`);
  // The flag must match the server in both directions. A stray E2E_PAYMOB_SANDBOX=1 (a shell profile, a copied command line) on an ordinary
  // run would only switch traces off, but it also means someone believes a sandbox run is happening: stop rather than guess.
  if (process.env.E2E_PAYMOB_SANDBOX === "1" && !mode?.sandbox) {
    throw new Error(`REFUSED: E2E_PAYMOB_SANDBOX=1 is set, but ${base} is not a Paymob sandbox server (or it could not be checked). Unset the variable for an ordinary run.`);
  }
  if (mode?.sandbox && process.env.E2E_PAYMOB_SANDBOX !== "1") {
    throw new Error(`REFUSED: ${base} is a Paymob SANDBOX server. Run only the sandbox spec against it, with E2E_PAYMOB_SANDBOX=1 (traces are then off); use a normal server for everything else.`);
  }
}
