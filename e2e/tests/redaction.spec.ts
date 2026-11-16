import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect, diagnosticsText } from "../fixtures/guard";
import { describeExternal, redact } from "../fixtures/redact";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scan } = require("../scripts/scan-artifacts.cjs");

// Regression tests: sensitive checkout values (client secret, public key, payment/auth tokens, Paymob keys) must never reach the diagnostics
// attachment, an assertion message, a trace or a test report. All values below are FAKE.
const FAKE = { clientSecret: "egy_csk_test_FAKEFAKEFAKE1234567890", publicKey: "egy_pk_test_FAKEPUBLICKEY0987654321", token: "FAKEPAYMENTTOKENabcdefghijklmnop" };
const jwt = "aaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbb.cccccccccccccccc";

test.describe("redaction of checkout secrets", () => {
  test("redact(): query strings, JSON bodies, headers, Paymob keys and JWTs", () => {
    const samples = [
      `GET https://eg.checkout.paymob.com/?publicKey=${FAKE.publicKey}&clientSecret=${FAKE.clientSecret}`,
      `{"client_secret":"${FAKE.clientSecret}","payment_token":"${FAKE.token}"}`,
      `Authorization: Token ${FAKE.token}`,
      `authorization: Bearer ${FAKE.token}`,
      `iframe?payment_token=${FAKE.token}#frag`,
      `using key ${"egy_sk_test_"}FAKESECRETKEY12345678 for the call`,
      `session ${jwt} expired`,
      `{'apiKey': '${FAKE.token}'}`,
    ];
    for (const s of samples) {
      const r = redact(s);
      for (const v of [...Object.values(FAKE), "FAKESECRETKEY12345678", jwt]) expect(r.includes(v), `${v} survived in: ${r}`).toBe(false);
    }
    expect(redact("GET /orders/abc?page=2 200")).toBe("GET /orders/abc?page=2 200"); // ordinary text is left alone
  });

  test("describeExternal(): host and path only, never a query value", () => {
    const text = describeExternal(`https://eg.checkout.paymob.com/pay?publicKey=${FAKE.publicKey}&clientSecret=${FAKE.clientSecret}#${FAKE.token}`);
    expect(text).toContain("eg.checkout.paymob.com/pay");
    expect(text).toContain("publicKey, clientSecret");
    for (const v of Object.values(FAKE)) expect(text.includes(v)).toBe(false);
  });

  test("the diagnostics of a page that provokes a blocked checkout request and logs secrets contain none of them", async ({ page }) => {
    test.info().annotations.push({ type: "allowed-external", description: "checkout.paymob.com" }); // aborted by the guard, on purpose
    await page.goto("/");
    await page.evaluate(({ f }) => {
      console.log(`checkout https://eg.checkout.paymob.com/?publicKey=${f.publicKey}&clientSecret=${f.clientSecret}`);
      console.error(`{"client_secret":"${f.clientSecret}","payment_token":"${f.token}"}`);
      fetch(`https://eg.checkout.paymob.com/?publicKey=${f.publicKey}&clientSecret=${f.clientSecret}&payment_token=${f.token}`).catch(() => undefined);
    }, { f: FAKE });
    // (the page's own CSP may refuse the fetch before the guard sees it; either way the browser reports it with the full URL)
    await expect.poll(() => diagnosticsText(page), { timeout: 10_000 }).toContain("payment_token=[redacted]");
    const text = diagnosticsText(page);
    expect(text).toContain("[redacted]");
    for (const v of Object.values(FAKE)) expect(text.includes(v), "a secret value reached the diagnostics").toBe(false);
  });

  test("the artefact scanner finds a planted secret in a text file and inside a zip (trace), reports names only, and passes a clean folder", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tgfm-scan-"));
    try {
      const secrets: Array<[string, string]> = [["PAYMOB_SECRET_KEY", "egy_sk_test_PLANTEDSECRETVALUE1234"]];
      fs.writeFileSync(path.join(dir, "clean.txt"), "nothing here");
      expect((await scan(secrets, [dir])).hits).toEqual([]);
      fs.writeFileSync(path.join(dir, "log.txt"), `oops ${secrets[0][1]}`);
      // a minimal STORED zip with one entry that holds the value (what a trace is, minus compression)
      const name = Buffer.from("0-trace.network"), data = Buffer.from(`{"url":"https://x/?clientSecret=${secrets[0][1]}"}`);
      const local = Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), (() => { const b = Buffer.alloc(8); b.writeUInt32LE(data.length, 0); b.writeUInt32LE(data.length, 4); return b; })(), Buffer.from([name.length, 0, 0, 0]), name, data]);
      const central = Buffer.concat([Buffer.from([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), (() => { const b = Buffer.alloc(8); b.writeUInt32LE(data.length, 0); b.writeUInt32LE(data.length, 4); return b; })(), Buffer.from([name.length, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), name]);
      const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(local.length, 16);
      fs.writeFileSync(path.join(dir, "trace.zip"), Buffer.concat([local, central, end]));
      const { hits } = await scan(secrets, [dir]);
      expect(hits.some((h: string) => h.includes("log.txt"))).toBe(true);
      expect(hits.some((h: string) => h.includes("trace.zip!0-trace.network")), "found inside the zip").toBe(true);
      expect(hits.join("\n").includes(secrets[0][1]), "the report never contains the value").toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("static guards: the sandbox spec records no trace and never asserts on a raw checkout URL; the guard prints host and path only", () => {
    const here = path.resolve(__dirname);
    const sandbox = fs.readFileSync(path.join(here, "paymob-sandbox.spec.ts"), "utf8");
    expect(sandbox).toMatch(/test\.use\(\{ trace: "off" \}\)/);
    // a value assertion on a URL prints both values when it fails; only boolean comparisons are allowed
    const risky = sandbox.split("\n").filter((l) => /expect\([^)]*(paymentUrl|clientSecret|publicKey|searchParams\.get)[^)]*\)\s*\.(toBe|toEqual|toContain|toMatch|toStrictEqual)\(/.test(l) && !/\)\.toBe\((true|false)\)/.test(l));
    expect(risky, "assertions that would print a checkout URL/secret on failure").toEqual([]);
    const config = fs.readFileSync(path.join(here, "../playwright.config.ts"), "utf8");
    expect(config, "sandbox runs have traces off").toMatch(/E2E_PAYMOB_SANDBOX === "1" \? "off"/);
    expect(config).toContain('globalSetup: "./global-setup.ts"');
    const gate = fs.readFileSync(path.join(here, "../global-setup.ts"), "utf8");
    expect(gate).toContain("api/qa-sim/paymob-mode");
    expect(gate).toMatch(/LIVE Paymob key/);
    expect(gate, "the flag is refused on a server that is not a sandbox").toMatch(/E2E_PAYMOB_SANDBOX === "1" && !mode\?\.sandbox/);
    const guard = fs.readFileSync(path.join(here, "../fixtures/guard.ts"), "utf8");
    expect(guard).toContain("describeExternal(route.request().url())");
    expect(guard).not.toMatch(/blocked\.push\(route\.request\(\)\.url\(\)\)/);
    expect(guard).toContain("redact(diag.join");
  });
});
