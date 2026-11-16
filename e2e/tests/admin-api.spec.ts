import { test, expect } from "../fixtures/guard";
import type { APIRequestContext, Browser } from "@playwright/test";
import { adminLoginApi, createUserAndLogin, loginApi, PASSWORD, uniqueEmail } from "../fixtures/helpers";

// Every /api/admin endpoint, called directly (no UI), as a guest, an ordinary user, a blocked user, a demoted admin and an admin; wrong
// methods and malformed parameters; and the admin Server Actions replayed by hand (the `$ACTION_ID_*` fields scraped from the real admin
// pages) by callers who are not admins. Payment, refund and webhook actions are deliberately not replayed.
const ENDPOINTS = ["/api/admin/me", "/api/admin/orders/export", "/api/admin/artworks/zip", "/api/admin/artworks/some-artwork-id/zip"];
const ACTION_PAGES = ["/admin/pricing", "/admin/products", "/admin/settings", "/admin/users", "/admin/team", "/admin/legal", "/admin/projects", "/admin/artworks", "/admin/bespoke"]; // not /admin/payments or /admin/orders/*

async function actor(browser: Browser, kind: "guest" | "user" | "blocked" | "demoted"): Promise<APIRequestContext> {
  const ctx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
  const page = await ctx.newPage();
  if (kind === "guest") return ctx.request;
  const email = uniqueEmail(kind);
  if (kind === "demoted") {
    expect((await page.request.post("/api/qa-sim/make-admin", { data: { email, password: PASSWORD } })).ok()).toBeTruthy();
    await loginApi(page, email, PASSWORD);
    await page.request.post("/api/qa-sim/set-user-state", { data: { email, role: "USER" } }); // the session token still says ADMIN
  } else {
    await createUserAndLogin(page, email);
    if (kind === "blocked") await page.request.post("/api/qa-sim/set-user-state", { data: { email, blocked: true } });
  }
  return ctx.request;
}

const snapshot = async (req: APIRequestContext) => {
  const j = await (await req.post("/api/qa-sim/catalog-info")).json();
  return JSON.stringify({ fabrics: j.fabrics, rules: j.rules, placements: j.placements, settings: j.settings, audits: j.audits.length });
};

test.describe("admin API and admin Server Actions, called directly", () => {
  for (const kind of ["guest", "user", "blocked", "demoted"] as const) {
    test(`${kind}: every admin endpoint refuses and leaks nothing`, async ({ browser }) => {
      const req = await actor(browser, kind);
      for (const path of ENDPOINTS) {
        const res = await req.get(path, { maxRedirects: 0 });
        const body = await res.text();
        expect(res.status(), `${kind} ${path}`).not.toBe(200);
        expect(res.status(), `${kind} ${path} must be a refusal or a redirect to login, never a server error`).toBeLessThan(500);
        expect(body, `${kind} ${path} leaked data`).not.toMatch(/orderNumber|order_number|"email":"qa-admin|PK\u0003\u0004/);
      }
    });
  }

  test("admin: endpoints work; wrong methods are 405; malformed parameters never cause a server error", async ({ page, browser }) => {
    await adminLoginApi(page);
    const me = await page.request.get("/api/admin/me");
    expect(me.status()).toBe(200);
    expect((await me.json()).ok).toBe(true);
    const csv = await page.request.get("/api/admin/orders/export");
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toMatch(/csv/);
    expect(csv.headers()["cache-control"] ?? "").toMatch(/no-store|private/);
    expect([200, 404]).toContain((await page.request.get("/api/admin/artworks/zip")).status());
    expect((await page.request.get("/api/admin/artworks/does-not-exist/zip")).status()).toBe(404);

    for (const path of ENDPOINTS) {
      for (const method of ["post", "put", "delete", "patch"] as const) {
        const res = await page.request[method](path, { maxRedirects: 0 });
        expect([405, 403, 404, 307, 308], `${method.toUpperCase()} ${path}`).toContain(res.status()); // never executed as a read
        expect(res.status(), `${method.toUpperCase()} ${path}`).not.toBe(200);
      }
    }
    const nasty = [
      "/api/admin/orders/export?status=%00&from=garbage&to=9999-99-99&minTotal=abc&maxTotal=-1",
      `/api/admin/orders/export?q=${encodeURIComponent("'; DROP TABLE \"Order\";--")}`,
      `/api/admin/orders/export?q=${"x".repeat(5000)}`,
      "/api/admin/orders/export?status=paid&status=cancelled&from=2999-01-01&to=1970-01-01",
      "/api/admin/artworks/zip?show=%00&q=%25",
      `/api/admin/artworks/zip?q=${"y".repeat(5000)}`,
      "/api/admin/artworks/..%2F..%2Fetc%2Fpasswd/zip",
      `/api/admin/artworks/${encodeURIComponent("a'b\"c")}/zip`,
    ];
    for (const path of nasty) {
      const res = await page.request.get(path, { maxRedirects: 0 });
      expect(res.status(), path.slice(0, 80)).toBeLessThan(500);
    }
    // The CSV must not let a customer-controlled cell act as a spreadsheet formula.
    const text = await csv.text();
    expect(text, "no raw formula-looking cell starts").not.toMatch(/(^|,)"?[=+@]\w+\(/m);
    void browser;
  });

  test("replaying real admin Server Action requests as guest, user, blocked and demoted admin is refused and changes nothing", async ({ page, browser }) => {
    test.setTimeout(300_000);
    await adminLoginApi(page);
    // Record the exact request the browser sends for each admin form (and abort it, so the recording itself changes nothing).
    type Recorded = { url: string; headers: Record<string, string>; body: Buffer; label: string };
    const recorded = new Map<string, Recorded>(); // action id -> request
    let capturing: string | null = null;
    page.on("dialog", (d) => d.accept());
    await page.route(/\/admin\//, async (route) => {
      const r = route.request();
      if (r.method() !== "POST" || !capturing) return route.continue();
      const headers = r.headers();
      const id = headers["next-action"];
      if (!id) return route.abort(); // a not-yet-hydrated plain form post: not a Server Action call, try again
      if (!recorded.has(id)) recorded.set(id, { url: r.url(), headers, body: r.postDataBuffer() ?? Buffer.alloc(0), label: capturing });
      return route.abort();
    });
    let control: Recorded | undefined;
    for (const path of ACTION_PAGES) {
      await expect(async () => { await page.goto(path); }).toPass({ timeout: 15_000 }); // an aborted recording can leave a navigation pending
      await page.waitForTimeout(1500); // let the page hydrate: before that a form submits as a plain navigation, which is not the request being recorded
      // EVERY form: in a production build a form whose action is a function passed through a client component has no `$ACTION_ID_` hidden
      // input once hydrated (it did in development), so selecting by that input found only a part of them. A form that is a plain GET
      // (a filter) just navigates; the page is reloaded afterwards and the next form is tried.
      const forms = page.locator("form");
      for (let i = 0; i < 12; i++) { // the first rows of a repeated list carry the same actions as the rest
        if (!new URL(page.url()).pathname.startsWith(path) || new URL(page.url()).search) { await page.goto(path); await page.waitForTimeout(1000); }
        if (i >= (await forms.count())) break;
        capturing = `${path}#${i}`;
        const before = recorded.size;
        // One attempt per form, bounded: a form whose action was already recorded, a plain GET filter, or one that needs a confirmed
        // state records nothing and is skipped.
        await forms.nth(i).evaluate((f: HTMLFormElement) => { f.noValidate = true; f.requestSubmit(); }, undefined, { timeout: 2000 }).catch(() => undefined);
        await expect.poll(() => recorded.size > before, { timeout: 1500 }).toBe(true).catch(() => undefined);
      }
      capturing = null;
    }
    // The control: the empty "add pricing rule" form (it only ever answers with a validation message).
    await page.goto("/admin/pricing");
    await page.waitForTimeout(1500);
    capturing = "control";
    const addRule = page.locator('form:has(input[name="minQty"]):has(select[name="product"])');
    await expect(async () => {
      await addRule.evaluate((f: HTMLFormElement) => { f.noValidate = true; f.requestSubmit(); });
      await expect.poll(() => [...recorded.values()].some((r) => r.label === "control"), { timeout: 2000 }).toBe(true);
    }).toPass({ timeout: 15_000 });
    control = [...recorded.values()].find((r) => r.label === "control");
    capturing = null;
    await page.unroute(/\/admin\//);
    expect(recorded.size, "the admin pages expose server-action forms to replay").toBeGreaterThan(5);
    expect(control, "the empty 'add pricing rule' request was recorded as the control").toBeTruthy();

    // A Server Action called by fetch answers 200 with its redirect in x-action-redirect; the proxy (guests) answers with a plain Location.
    const dest = (res: import("@playwright/test").APIResponse) => res.headers()["x-action-redirect"] ?? res.headers()["location"] ?? "";
    const replay = (req: APIRequestContext, r: Recorded) => {
      const { host, cookie, "content-length": _cl, ...headers } = r.headers; void host; void cookie; void _cl;
      return req.fetch(r.url, { method: "POST", headers, data: r.body, maxRedirects: 0 });
    };

    // Control: as the admin, the very same recorded request IS executed (a validation flash on its own page), so a refusal below means something.
    const ok = await replay(page.request, control!);
    expect(dest(ok), `admin control replay: ${ok.status()}`).toMatch(/\/admin\/pricing\?(error|notice)=/);

    const before = await snapshot(page.request);
    let attempts = 0;
    for (const kind of ["guest", "user", "blocked", "demoted"] as const) {
      const req = await actor(browser, kind);
      for (const r of recorded.values()) {
        attempts++;
        const res = await replay(req, r);
        expect(dest(res), `${kind} replay of "${r.label}": ${res.status()} ${(await res.text()).slice(0, 120)}`).toMatch(/\/admin\/login/);
      }
    }
    expect(attempts).toBeGreaterThan(20);
    expect(await snapshot(page.request), "no catalog, price, settings or audit state changed").toBe(before);
  });
});
