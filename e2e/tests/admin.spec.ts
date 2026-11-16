import { test, expect } from "../fixtures/guard";
import { stub } from "../fixtures/stub";
import { checkoutToPaymentBoundary, createUserAndLogin, uniqueEmail, userWithBagItem } from "../fixtures/helpers";

// Admin area against the real app + real PostgreSQL: access control, every admin page, order visibility, user blocking through the UI,
// CSV export, role demotion taking effect immediately.
const ADMIN = { email: "qa-admin@tgfm.test", password: "qa-admin-oEMUOFH58pG8j-Uo" };
const PAGES: Array<[string, RegExp]> = [
  ["/admin", /dashboard|overview|orders|revenue/i], ["/admin/orders", /orders/i], ["/admin/users", /users|customers/i], ["/admin/products", /products|catalog|fabric/i],
  ["/admin/pricing", /pricing|price/i], ["/admin/payments", /payments|webhook/i], ["/admin/projects", /projects|designs/i], ["/admin/artworks", /artwork/i],
  ["/admin/bespoke", /bespoke/i], ["/admin/audit", /audit/i], ["/admin/settings", /settings/i], ["/admin/system", /system|health/i], ["/admin/team", /team|admins/i], ["/admin/legal", /legal|terms|privacy/i],
];

async function adminLogin(page: import("@playwright/test").Page) {
  await page.request.post("/api/qa-sim/make-admin", { data: ADMIN });
  await page.goto("/admin/login");
  await page.locator('input[type="email"]').fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/admin(?!\/login)/, { timeout: 20_000 });
}

test.describe("admin", () => {
  test.beforeEach(async () => { await stub.reset(); });

  test("anonymous and ordinary users are kept out of every admin page and admin API", async ({ page, browser }) => {
    for (const [path] of PAGES) { await page.goto(path); await expect(page, path).toHaveURL(/\/admin\/login/); }
    expect((await page.request.get("/api/admin/orders/export", { maxRedirects: 0 })).status()).toBeGreaterThanOrEqual(300);
    const ctx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const user = await ctx.newPage();
    await createUserAndLogin(user, uniqueEmail("notadmin"));
    for (const [path] of PAGES.slice(0, 5)) { await user.goto(path); await expect(user, path).toHaveURL(/\/admin\/login/); }
    expect([401, 403]).toContain((await user.request.get("/api/admin/me", { maxRedirects: 0 })).status());
    await ctx.close();
  });

  test("an admin opens every admin page without an error", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await adminLogin(page);
    for (const [path, heading] of PAGES) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBeLessThan(400);
      await expect(page.locator("body"), path).toContainText(heading);
      await expect(page.locator("body"), path).not.toContainText(/something went wrong|application error|unexpected error/i);
    }
    expect(errors, "no uncaught page error in the admin area").toEqual([]);
  });

  test("a customer's order appears in the admin order list and detail; CSV export works; users page lists the customer", async ({ page, browser }) => {
    const buyerCtx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const buyer = await buyerCtx.newPage();
    const customer = await userWithBagItem(buyer, uniqueEmail("adminbuyer"));
    await buyer.goto("/bag");
    await buyer.getByRole("link", { name: /checkout/i }).or(buyer.getByRole("button", { name: /^checkout$/i })).first().click();
    await checkoutToPaymentBoundary(buyer, { email: customer.email, name: "Admin View Buyer" });
    await buyerCtx.close();

    await adminLogin(page);
    await page.goto("/admin/orders");
    await expect(page.locator("body")).toContainText(/Admin View Buyer|adminbuyer/i);
    const href = await page.locator('a[href^="/admin/orders/"]').first().getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(href!);
    await expect(page.locator("body")).toContainText(/Admin View Buyer|adminbuyer/i);
    const csv = await page.request.get("/api/admin/orders/export");
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toMatch(/csv|text/);
    expect(await csv.text()).toContain("adminbuyer");
    await page.goto(`/admin/users?q=${encodeURIComponent(customer.email.slice(0, 12))}`);
    await expect(page.locator("body")).toContainText(customer.email);
  });

  test("blocking a customer in the admin UI cuts them off immediately; unblocking restores access", async ({ page, browser }) => {
    const email = uniqueEmail("toblock");
    const buyerCtx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const buyer = await buyerCtx.newPage();
    await createUserAndLogin(buyer, email);
    await buyer.goto("/orders");
    await expect(buyer).toHaveURL(/\/orders/);

    await adminLogin(page);
    await page.goto(`/admin/users?q=${encodeURIComponent(email)}`);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /^block$/i }).first().click();
    await page.getByRole("button", { name: /^(block|confirm|yes)/i }).last().click({ timeout: 3000 }).catch(() => undefined); // app-level confirm dialog, if any
    await expect(page.locator("body")).toContainText(/blocked/i, { timeout: 15_000 });

    await buyer.goto("/orders");
    await expect(buyer, "a blocked customer's existing session stops working").toHaveURL(/\/login/);

    await page.goto(`/admin/users?q=${encodeURIComponent(email)}`);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /^unblock$/i }).first().click();
    await page.getByRole("button", { name: /^(unblock|confirm|yes)/i }).last().click({ timeout: 3000 }).catch(() => undefined);
    await expect(page.locator("body")).toContainText(/active/i, { timeout: 15_000 });
    await buyer.goto("/orders");
    await expect(buyer).toHaveURL(/\/orders/);
    await buyerCtx.close();
  });

  test("demoting an admin in the database removes access on the next request although the session still says ADMIN", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/orders");
    await expect(page).toHaveURL(/\/admin\/orders/);
    await page.request.post("/api/qa-sim/set-user-state", { data: { email: ADMIN.email, role: "USER" } });
    await page.goto("/admin/orders");
    await expect(page).toHaveURL(/\/admin\/login/);
    expect([401, 403]).toContain((await page.request.get("/api/admin/me", { maxRedirects: 0 })).status());
    expect((await page.request.get("/api/admin/orders/export", { maxRedirects: 0 })).status()).not.toBe(200);
    await page.request.post("/api/qa-sim/make-admin", { data: ADMIN }); // restore for the other tests
  });
});
