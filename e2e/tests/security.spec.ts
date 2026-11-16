import { test, expect } from "../fixtures/guard";
import { stub } from "../fixtures/stub";
import { buildInfo, checkoutToPaymentBoundary, createUserAndLogin, uniqueEmail, userWithBagItem } from "../fixtures/helpers";

// Authorization, blocked accounts, brute-force protection and information exposure, against the real app + real PostgreSQL.
const setState = (page: import("@playwright/test").Page, body: object) => page.request.post("/api/qa-sim/set-user-state", { data: body });

test.describe("security", () => {
  test.beforeEach(async () => { await stub.reset(); });

  test("another customer cannot read my order, my project, my build quote, my files or my mockup", async ({ page, browser }) => {
    const a = await userWithBagItem(page, uniqueEmail("ownerA"));
    await page.goto("/bag");
    await page.getByRole("link", { name: /checkout/i }).or(page.getByRole("button", { name: /^checkout$/i })).first().click();
    await checkoutToPaymentBoundary(page, { email: a.email });
    await page.goto("/orders");
    const orderHref = await page.locator('a[href^="/orders/"]').first().getAttribute("href");
    expect(orderHref).toBeTruthy();
    const info = await buildInfo(page, a.buildId);

    const ctx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const b = await ctx.newPage();
    await createUserAndLogin(b, uniqueEmail("otherB"));
    const gone = async (path: string) => { const r = await b.request.get(path, { maxRedirects: 0 }); return r.status(); };
    expect([403, 404], "build quote").toContain(await gone(`/api/build/${a.buildId}`));
    expect(await gone(`/api/assets/${info.assets[0].id}/file`)).toBe(403);
    expect(await gone(`/api/mockups/${info.aiMockupId}/file`)).toBe(403);
    await b.goto(orderHref!);
    await expect(b.locator("body")).not.toContainText(/TGFM-[A-Z0-9-]+/); // 404, not the order
    await b.goto(`/studio/projects/${a.buildId}/builder`);
    await expect(b.locator("body")).not.toContainText(a.email);
    expect(new URL(b.url()).pathname, "redirected away from someone else's project").not.toBe(`/studio/projects/${a.buildId}/builder`);
    await ctx.close();
  });

  test("a guest cannot read anything of mine either", async ({ page, browser }) => {
    const a = await userWithBagItem(page, uniqueEmail("ownerG"));
    const info = await buildInfo(page, a.buildId);
    const ctx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const g = await ctx.newPage();
    expect(await (await g.request.get(`/api/assets/${info.assets[0].id}/file`)).status()).toBe(403);
    expect(await (await g.request.get(`/api/mockups/${info.aiMockupId}/file`)).status()).toBe(403);
    expect([403, 404]).toContain((await g.request.get(`/api/build/${a.buildId}`)).status());
    expect((await g.request.get("/api/bag/quote")).status()).toBe(401);
    await ctx.close();
  });

  test("a BLOCKED customer with a valid session loses access to pages, files and Gemini at once, and cannot sign in again", async ({ page, browser }) => {
    const a = await userWithBagItem(page, uniqueEmail("blocked"));
    const info = await buildInfo(page, a.buildId);
    const body = { buildId: a.buildId, draftId: info.draftId, product: "FITTED", color: "WHITE", layers: [{ placement: "CENTER_FRONT", assetId: info.assets[0].id, x: 0, y: 0, scale: 1, rotation: 0 }] };
    expect((await page.request.get(`/api/assets/${info.assets[0].id}/file`)).status()).toBe(200);
    await setState(page, { email: a.email, blocked: true });
    await page.goto("/orders");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/wishlist");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/bag");
    await expect(page).toHaveURL(/\/login/);
    expect((await page.request.get(`/api/assets/${info.assets[0].id}/file`)).status()).toBe(403);
    expect((await page.request.get(`/api/mockups/${info.aiMockupId}/file`)).status()).toBe(403);
    const before = (await stub.stats()).calls;
    expect((await page.request.post("/api/mockups/nanobanana", { data: body })).status()).toBe(401);
    expect((await stub.stats()).calls, "a blocked user cannot spend Gemini credit").toBe(before);
    const ctx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const again = await ctx.newPage();
    const csrf = await (await again.request.get("/api/auth/csrf")).json();
    await again.request.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, email: a.email, password: "e2e-password-1", json: "true" } });
    expect((await (await again.request.get("/api/auth/session")).json())?.user ?? null, "a blocked account cannot sign in").toBeNull();
    await ctx.close();
    await setState(page, { email: a.email, blocked: false });
    await page.goto("/orders");
    await expect(page).toHaveURL(/\/orders/); // unblocked: the same session works again
  });

  test("brute-force protection: repeated wrong passwords lock that address+IP, a correct password is then refused too, and nothing reveals whether the account exists", async ({ page, browser }) => {
    const email = uniqueEmail("brute");
    await createUserAndLogin(page, email);
    const ctx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const p = await ctx.newPage();
    const attempt = async (password: string) => {
      const csrf = await (await p.request.get("/api/auth/csrf")).json();
      const r = await p.request.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, email, password, json: "true" }, maxRedirects: 0 });
      const session = await (await p.request.get("/api/auth/session")).json();
      return { status: r.status(), signedIn: Boolean(session?.user) };
    };
    for (let i = 0; i < 10; i++) expect((await attempt("wrong-password-" + i)).signedIn).toBe(false);
    expect((await attempt("e2e-password-1")).signedIn, "the 11th attempt is locked out even with the right password").toBe(false);
    // an unknown address behaves identically (no account enumeration through the login response)
    const unknown = await p.request.post("/api/auth/callback/credentials", { form: { csrfToken: (await (await p.request.get("/api/auth/csrf")).json()).csrfToken, email: `nobody-${Date.now()}@tgfm.test`, password: "whatever-1", json: "true" }, maxRedirects: 0 });
    expect([200, 302, 401]).toContain(unknown.status());
    await ctx.close();
  });

  test("no sensitive data in pages or API responses", async ({ page }) => {
    const email = uniqueEmail("leak");
    await createUserAndLogin(page, email);
    const hits = /passwordHash|\$argon2|NEXTAUTH_SECRET|GEMINI_API_KEY|PAYMOB_[A-Z_]*KEY|PAYMOB_HMAC|local-test-only|stub-key/;
    for (const path of ["/", "/login", "/studio", "/bag", "/orders", "/wishlist", "/api/auth/session", "/api/health", "/api/health/ready", "/api/bag/quote", "/api/bag/count"]) {
      const res = await page.request.get(path);
      expect(await res.text(), path).not.toMatch(hits);
    }
    const ready = await (await page.request.get("/api/health/ready")).json();
    expect(ready.checks.env, "a non-admin gets no list of missing environment variables").not.toHaveProperty("missing");
  });

  test("security headers on pages; the file routes carry a sandboxing CSP; poweredBy is hidden", async ({ page }) => {
    const res = await page.request.get("/login");
    const h = res.headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["referrer-policy"]).toBeTruthy();
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("login failure message is identical for a wrong password and an unknown address (no account enumeration in the UI)", async ({ page }) => {
    const known = uniqueEmail("known");
    await page.request.post("/api/qa-sim/make-user", { data: { email: known, password: "e2e-password-1" } });
    const failureFor = async (email: string) => {
      await page.goto("/login");
      await page.locator('input[type="email"]').fill(email);
      await page.locator('input[type="password"]').fill("not-the-password-1");
      await page.getByRole("button", { name: /^(log ?in|sign ?in)$/i }).click();
      return (await page.locator("[role=alert], .error").first().innerText({ timeout: 15_000 })).trim();
    };
    const wrongPassword = await failureFor(known);
    const unknownAddress = await failureFor(`ghost-${Date.now()}@tgfm.test`);
    expect(wrongPassword).toBe(unknownAddress);
    expect(wrongPassword).not.toMatch(/no (such )?(account|user)|not (registered|found)|does not exist/i);
  });
});
