import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { describeExternal, redact } from "./redact";

// The diagnostics of each page, readable by the regression test (tests/redaction.spec.ts); already redacted.
const diagnosticsStore = new WeakMap<Page, string[]>();
export const diagnosticsText = (page: Page) => (diagnosticsStore.get(page) ?? []).join("\n");

// Aborts every request that does not go to localhost, so a test can never reach Gemini, Paymob (sandbox or live), Resend or a real database.
export const test = base.extend({
  page: async ({ page, context }, use) => {
    // Stored as host + path only: the failure message below prints this list, and a checkout URL carries a client secret in its query string.
    const blocked: string[] = [];
    // Routed on the CONTEXT, so popups and new tabs (e.g. the WhatsApp tab the Bespoke flow opens) are covered as well.
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.protocol === "data:" || url.protocol === "blob:") return route.continue();
      blocked.push(describeExternal(route.request().url()));
      return route.abort();
    });
    // A production build streams a page: at the `load` event the content of a not-yet-ready boundary can still sit in a hidden
    // `<div id="S:n">` that a small inline script swaps in a moment later (first request of a route, a cold server). An action taken in
    // that gap finds the same form twice (hidden + shown) or none at all. Wait until every boundary has been swapped in.
    const goto = page.goto.bind(page);
    page.goto = (async (url: string, options?: Parameters<typeof goto>[1]) => {
      const response = await goto(url, options);
      await page.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15_000 });
      return response;
    }) as typeof page.goto;
    // Diagnostics for every test (kept as an attachment when it fails, or always with E2E_DIAG=1): console, page errors, main-frame
    // navigations (a second navigation inside one test = the page reloaded under it) and failed / 4xx / 5xx requests.
    const diag: string[] = [];
    const t0 = Date.now();
    diagnosticsStore.set(page, diag);
    const log = (kind: string, msg: string) => diag.push(`${String(Date.now() - t0).padStart(6)}ms ${kind} ${redact(msg)}`);
    page.on("console", (m) => log(`console.${m.type()}`, m.text().slice(0, 400)));
    page.on("pageerror", (e) => log("pageerror", String(e.message).slice(0, 400)));
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) log("navigated", f.url()); });
    page.on("requestfailed", (r) => log("requestfailed", `${r.method()} ${r.url()} ${r.failure()?.errorText ?? ""}`));
    page.on("response", (r) => { if (r.status() >= 400) log(`http.${r.status()}`, `${r.request().method()} ${r.url()}`); });
    // The same wait after a reload (a reload streams the page again, and its loading fallback and the real content coexist until the swap).
    const reload = page.reload.bind(page);
    page.reload = (async (options?: Parameters<typeof reload>[0]) => {
      const response = await reload(options);
      await page.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 15_000 });
      return response;
    }) as typeof page.reload;
    await use(page);
    const info = test.info();
    if (info.status !== info.expectedStatus || process.env.E2E_DIAG === "1") {
      await info.attach("diagnostics.log", { body: redact(diag.join("\n")) || "(empty)", contentType: "text/plain" });
    }
    expect(blocked.filter((u) => !test.info().annotations.some((a) => a.type === "allowed-external" && u.includes(a.description ?? "\u0000"))), "no request may leave localhost").toEqual([]);
  },
});
export { expect };

// 1x1 PNG used as the uploaded artwork
export const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
export const QA_SECRETS = { hmac: "qa-local-hmac-secret-not-a-real-key" }; // exists only in the isolated copy
