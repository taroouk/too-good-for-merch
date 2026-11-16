import { test, expect } from "../fixtures/guard";
import type { Page } from "@playwright/test";
import { adminLoginApi, checkoutToPaymentBoundary, createUserAndLogin, submitUntilPosted, uniqueEmail, userWithBagItem, settle } from "../fixtures/helpers";

// The admin Server Actions that no other spec drives: team (promote / demote), legal pages, order notes + status + shipping, project archive.
// Payment-changing actions (mark paid, refund, retry link, resend payment email) are deliberately NOT exercised here.
const alertText = (page: Page) => page.getByRole("alert").first();

test.describe("admin actions", () => {
  test.beforeEach(async ({ page }) => { await adminLoginApi(page); });

  test("team: promote by email, the new admin can use the admin API at once, demote removes it; bad input is refused", async ({ page, browser }) => {
    const email = uniqueEmail("teamer");
    const ctx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const user = await ctx.newPage();
    await createUserAndLogin(user, email);
    expect([401, 403, 307, 308]).toContain((await user.request.get("/api/admin/me", { maxRedirects: 0 })).status());

    const tryPromote = async (value: string) => {
      await page.goto("/admin/team");
      const form = page.locator('form:has(input[name="email"])');
      await form.locator('input[name="email"]').fill(value);
      await form.evaluate((f: HTMLFormElement) => { f.noValidate = true; }); // let the server, not the browser, judge the value
      await submitUntilPosted(page, form.getByRole("button", { name: /make admin/i }));
    };
    await tryPromote("not-an-email");
    await expect(alertText(page)).toContainText(/valid email/i, { timeout: 20_000 });
    await tryPromote(`nobody-${Date.now()}@tgfm.test`);
    await expect(alertText(page)).toContainText(/no account exists/i, { timeout: 20_000 });
    expect([401, 403, 307, 308], "still not an admin after the refused attempts").toContain((await user.request.get("/api/admin/me", { maxRedirects: 0 })).status());

    await tryPromote(email);
    await expect.poll(async () => (await user.request.get("/api/admin/me", { maxRedirects: 0 })).status(), { timeout: 15_000 }).toBe(200);

    await page.goto("/admin/team");
    const row = page.locator("div").filter({ hasText: email }).filter({ has: page.getByRole("button", { name: /remove admin/i }) }).last();
    await row.getByRole("button", { name: /remove admin/i }).click();
    await page.getByRole("button", { name: /^confirm$/i }).click();
    await expect.poll(async () => (await user.request.get("/api/admin/me", { maxRedirects: 0 })).status(), { timeout: 15_000 }).not.toBe(200);
    await ctx.close();
  });

  test("legal pages: an edit goes live as plain text (markup is not executed); too-short titles are refused; reverting restores the built-in draft", async ({ page }) => {
    const form = () => page.locator('form:has(input[name="slug"][value="refunds"]):has(textarea[name="body"])');
    const title = `E2E Refund Policy ${Date.now() % 100000}`;
    await page.goto("/admin/legal");
    await form().locator('input[name="title"]').fill(title);
    await form().locator('textarea[name="body"]').fill('## Our promise\nWe refund **fast**.\n<script>window.__legalXss = 1</script><img src=x onerror="window.__legalXss = 2">');
    await submitUntilPosted(page, form().getByRole("button", { name: /save & publish/i }));
    await page.goto("/legal/refunds");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByRole("heading", { name: "Our promise" })).toBeVisible();
    await expect(page.locator("main")).toContainText("<script>"); // shown as text
    expect(await page.evaluate(() => (window as unknown as { __legalXss?: number }).__legalXss), "no markup from the page body ran").toBeUndefined();
    expect(await page.locator("main script, main img").count(), "the body produced no script or img element").toBe(0);

    await page.goto("/admin/legal");
    await form().locator('input[name="title"]').evaluate((el: HTMLInputElement) => { el.removeAttribute("minlength"); el.removeAttribute("required"); });
    await form().locator('input[name="title"]').fill("ab");
    await submitUntilPosted(page, form().getByRole("button", { name: /save & publish/i }));
    await expect(alertText(page)).toBeVisible({ timeout: 20_000 });
    await page.goto("/legal/refunds");
    await expect(page.getByRole("heading", { level: 1 }), "the refused edit changed nothing").toHaveText(title);

    await page.goto("/admin/legal");
    const revert = page.locator('form:has(input[name="slug"][value="refunds"])').getByRole("button", { name: /revert to built-in draft/i });
    await revert.click();
    await page.getByRole("button", { name: /^confirm$/i }).click();
    await expect.poll(async () => { await page.goto("/legal/refunds"); return page.getByRole("heading", { level: 1 }).innerText(); }, { timeout: 15_000 }).not.toBe(title);
  });

  test("an order: add notes, change status along the allowed path, refuse a forged jump, ship with tracking, edit tracking, complete; invalid tracking is refused", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const buyerCtx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const buyer = await buyerCtx.newPage();
    const customer = await userWithBagItem(buyer, uniqueEmail("ship"));
    await buyer.goto("/bag");
    await buyer.getByRole("link", { name: /checkout/i }).or(buyer.getByRole("button", { name: /^checkout$/i })).first().click();
    await checkoutToPaymentBoundary(buyer, { email: customer.email, name: "Ship Test Buyer" });

    await page.goto("/admin/orders");
    const href = (await page.locator('a[href^="/admin/orders/"]').filter({ hasText: /./ }).first().getAttribute("href"))!;
    const orderId = href.split("/").pop()!;
    // "Paid" is simulated in the isolated database only (no Paymob involved); it is the precondition for fulfilment.
    expect((await buyer.request.post("/api/qa-sim/mark-paid", { data: { orderId } })).ok()).toBeTruthy();
    await page.goto(href);

    // Notes
    const note = `Packed with care ${Date.now() % 10000}`;
    await page.locator('form:has(input[name="id"]) textarea[name="body"]').fill(note);
    await submitUntilPosted(page, page.getByRole("button", { name: /add note/i }));
    await expect(page.locator("body")).toContainText(note);
    await page.locator('form:has(input[name="id"]) textarea[name="body"]').fill("   ");
    await submitUntilPosted(page, page.getByRole("button", { name: /add note/i }));
    await expect(alertText(page)).toBeVisible({ timeout: 20_000 }); // an empty note is refused

    // Forged jump PAID -> COMPLETED (the form only offers In production / Cancelled)
    await page.goto(href);
    const forged = (await page.locator('form:has(input[name="status"][value="IN_PRODUCTION"])').elementHandle())!;
    await forged.evaluate((f: HTMLFormElement) => { (f.elements.namedItem("status") as HTMLInputElement).value = "COMPLETED"; });
    const posted = page.waitForResponse((r) => r.request().method() === "POST" && !new URL(r.url()).pathname.startsWith("/api/"), { timeout: 15_000 });
    await forged.evaluate((f: HTMLFormElement) => f.requestSubmit());
    await posted;
    await expect(alertText(page)).toContainText(/not allowed/i, { timeout: 20_000 });
    await page.goto(href);
    await expect(page.locator("body"), "still PAID: no jump happened").not.toContainText(/Move to Shipped/i);
    await expect(page.locator('form:has(input[name="status"][value="IN_PRODUCTION"])')).toBeVisible();

    // The allowed step
    await submitUntilPosted(page, page.locator('form:has(input[name="status"][value="IN_PRODUCTION"])').getByRole("button"));
    await page.goto(href);
    await expect(page.locator('form:has(input[name="status"][value="IN_PRODUCTION"])'), "no longer offered once in production").toHaveCount(0);

    // Shipping: bad tracking refused, then a good one
    const ship = page.locator('form:has(input[name="carrier"]):has(input[name="trackingNumber"])').first();
    await ship.locator('input[name="carrier"]').fill("X");
    await ship.evaluate((f: HTMLFormElement) => { f.noValidate = true; });
    await submitUntilPosted(page, ship.getByRole("button", { name: /mark as shipped/i }));
    await expect(alertText(page)).toContainText(/courier/i, { timeout: 20_000 });
    await page.goto(href);
    const ship2 = page.locator('form:has(input[name="carrier"]):has(input[name="trackingNumber"])').first();
    await ship2.evaluate((f: HTMLFormElement) => { f.noValidate = true; });
    await ship2.locator('input[name="carrier"]').fill("Bosta");
    await ship2.locator('input[name="trackingNumber"]').fill("TRK123");
    await ship2.locator('input[name="trackingUrl"]').fill("javascript:alert(1)");
    await submitUntilPosted(page, ship2.getByRole("button", { name: /mark as shipped/i }));
    await expect(alertText(page), "a javascript: tracking link is refused").toBeVisible({ timeout: 20_000 });
    await page.goto(href);
    const ship3 = page.locator('form:has(input[name="carrier"]):has(input[name="trackingNumber"])').first();
    await ship3.locator('input[name="carrier"]').fill("Bosta");
    await ship3.locator('input[name="trackingNumber"]').fill("TRK123");
    await ship3.locator('input[name="trackingUrl"]').fill("https://track.example.test/TRK123");
    await submitUntilPosted(page, ship3.getByRole("button", { name: /mark as shipped/i }));
    await page.goto(href);
    await expect(page.locator("body")).toContainText("TRK123");
    await expect(page.locator("body")).toContainText("Bosta");

    // Edit tracking, then complete
    await page.getByText("Edit tracking").click();
    const edit = page.locator('form:has(input[aria-label="Tracking number"])');
    await edit.locator('input[aria-label="Tracking number"]').fill("TRK999");
    await submitUntilPosted(page, edit.getByRole("button", { name: /save tracking/i }));
    await page.goto(href);
    await expect(page.locator("body")).toContainText("TRK999");
    await submitUntilPosted(page, page.locator('form:has(input[name="status"][value="COMPLETED"])').getByRole("button"));
    await page.goto(href);
    await expect(page.locator("body")).toContainText(/No further status changes/i);
    await buyerCtx.close();
  });

  test("projects: a customer's project can be archived and restored from the admin", async ({ page, browser }) => {
    const ctx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const customer = await ctx.newPage();
    const email = uniqueEmail("proj");
    await createUserAndLogin(customer, email);
    await customer.goto("/studio/projects/new");
    await customer.locator('input[name="name"]').fill(`E2E Project ${Date.now() % 100000}`);
    await submitUntilPosted(customer, customer.getByRole("button", { name: "Create" }));
    await page.goto(`/admin/projects?q=${encodeURIComponent(email)}`);
    await expect(page.locator("body")).toContainText(/E2E Project/);
    await page.getByRole("button", { name: /^archive$/i }).first().click();
    // Wait for the archive request itself: "the network is idle" can be true before the click has even sent it, and the goto below
    // would then cancel it.
    const archived = page.waitForResponse((r) => r.request().method() === "POST" && !new URL(r.url()).pathname.startsWith("/api/"));
    await page.getByRole("button", { name: /^confirm$/i }).click();
    await archived;
    await settle(page);
    await page.goto(`/admin/projects?q=${encodeURIComponent(email)}&status=archived`);
    await expect(page.getByRole("button", { name: /^restore$/i }).first()).toBeVisible();
    await submitUntilPosted(page, page.getByRole("button", { name: /^restore$/i }).first());
    await page.goto(`/admin/projects?q=${encodeURIComponent(email)}`);
    await expect(page.getByRole("button", { name: /^archive$/i }).first()).toBeVisible();
    await ctx.close();
  });

  test("artworks: a paid order's artwork is listed, downloadable as a zip (one and all), deletable; the order page still opens afterwards", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const buyerCtx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const buyer = await buyerCtx.newPage();
    const customer = await userWithBagItem(buyer, uniqueEmail("art"));
    await buyer.goto("/bag");
    await buyer.getByRole("link", { name: /checkout/i }).or(buyer.getByRole("button", { name: /^checkout$/i })).first().click();
    await checkoutToPaymentBoundary(buyer, { email: customer.email, name: "Artwork Test Buyer" });
    await page.goto("/admin/orders");
    const href = (await page.locator('a[href^="/admin/orders/"]').filter({ hasText: /./ }).first().getAttribute("href"))!;
    expect((await buyer.request.post("/api/qa-sim/mark-paid", { data: { orderId: href.split("/").pop()! } })).ok()).toBeTruthy();

    await page.goto(`/admin/artworks?show=paid&q=${encodeURIComponent(customer.email)}`);
    const zipLink = page.locator('a[href^="/api/admin/artworks/"][href$="/zip"]').first();
    await expect(zipLink).toBeVisible();
    const zipHref = (await zipLink.getAttribute("href"))!;
    const one = await page.request.get(zipHref);
    expect(one.status()).toBe(200);
    expect(one.headers()["content-type"]).toMatch(/zip/);
    expect((await one.body()).subarray(0, 2).toString("latin1"), "a real zip archive").toBe("PK");
    const all = await page.request.get("/api/admin/artworks/zip?show=paid");
    expect(all.status()).toBe(200);
    expect((await all.body()).subarray(0, 2).toString("latin1")).toBe("PK");

    await page.getByRole("button", { name: /^delete/i }).first().click();
    await page.getByRole("button", { name: /^confirm$/i }).click();
    await expect.poll(async () => (await page.request.get(zipHref)).status(), { timeout: 15_000 }).toBe(404);
    expect((await page.goto(href))?.status(), "the order page still opens after its artwork was deleted").toBe(200);
    await expect(page.locator("body")).toContainText(/Artwork Test Buyer/);
    await buyerCtx.close();
  });
});
