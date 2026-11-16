import { test, expect } from "../fixtures/guard";
import { stub } from "../fixtures/stub";
import { artworkPng, createUserAndLogin, gotoStudioPage, openAccountMenu, loginViaPage, openDesigner, uniqueEmail, uploadAndPlace, PASSWORD, settle } from "../fixtures/helpers";

// The customer journey, one serial flow per viewport project: account -> designer -> upload -> Gemini (local stub) -> persistence -> bag
// -> wishlist -> checkout up to the payment boundary -> orders -> logout/login. Paymob is not configured in the isolated environment, so
// "continue to payment" fails before any request leaves the machine (the guard fixture fails the test if anything non-local is attempted).
test.describe.configure({ mode: "serial" });

test.describe("customer journey", () => {
  const email = uniqueEmail("journey");

  test.beforeAll(async () => { await stub.reset(); });

  test("a signed-in user opens the designer; upload, placement and the Gemini mockup", async ({ page }) => {
    await createUserAndLogin(page, email);
    await openDesigner(page);
    await expect(page.getByText(/0 ?\/ ?4/)).toBeVisible();
    await uploadAndPlace(page);
    const before = (await stub.stats()).calls;
    await page.getByRole("button", { name: /save t-shirt/i }).click();
    await expect.poll(async () => (await stub.stats()).calls, { timeout: 30_000 }).toBe(before + 1);
    await expect(page.getByTestId("preview-error")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /add to bag/i })).toBeVisible();
    await expect(page.getByText(/print (mockup|preview)/i)).toHaveCount(0);
  });

  test("the design is restored after a reload (persistence)", async ({ page }) => {
    await createUserAndLogin(page, email); // new context: sign in again with the same account
    await openDesigner(page);
    await expect(page.getByText(/1 ?\/ ?4/)).toBeVisible({ timeout: 15_000 });
  });

  test("add to bag, persistence of the bag, empty-bag state after removal", async ({ page }) => {
    await createUserAndLogin(page, email);
    await gotoStudioPage(page);
    await page.getByRole("button", { name: /add to bag/i }).click();
    await expect(page.getByText(/added to your bag/i)).toBeVisible({ timeout: 15_000 });
    await page.goto("/bag");
    await expect(page.getByText(/1 item/i)).toBeVisible();
    await expect(page.getByText(/EGP\s?401/).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(/1 item/i)).toBeVisible(); // survives a reload
    await page.getByRole("button", { name: /^remove$/i }).click();
    await expect(page.getByText(/your bag is empty|nothing in your bag|0 items?/i).first()).toBeVisible({ timeout: 15_000 });
    // put it back for the checkout step
    await gotoStudioPage(page);
    await page.getByRole("button", { name: /add to bag/i }).click();
    await expect(page.getByText(/added to your bag/i)).toBeVisible({ timeout: 15_000 });
  });

  test("wishlist: add, persistence, remove", async ({ page }) => {
    await createUserAndLogin(page, email);
    await gotoStudioPage(page);
    const action = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/studio/projects/"));
    await page.getByRole("button", { name: /add to wishlist/i }).click();
    await action; // the server action must have finished before we leave the page
    await expect(page.getByRole("button", { name: /in your wishlist/i }).or(page.locator("[role=status]").filter({ hasText: /wishlist/i })).first()).toBeVisible({ timeout: 15_000 });
    await page.goto("/wishlist");
    await expect(page.locator("main")).not.toContainText(/your wishlist is empty|nothing saved/i);
    await page.reload();
    await expect(page.locator("main")).not.toContainText(/your wishlist is empty|nothing saved/i);
    await page.getByRole("button", { name: "Remove", exact: true }).first().click();
    await expect(page.getByText("Remove?")).toBeVisible(); // two-step confirmation: Keep / Remove
    await page.getByRole("button", { name: "Keep" }).click();
    await expect(page.locator("main")).toContainText(/1 saved design/i); // "Keep" really keeps it
    await page.getByRole("button", { name: "Remove", exact: true }).first().click();
    await page.getByRole("button", { name: "Remove", exact: true }).last().click();
    await expect(page.locator("main")).toContainText(/wishlist is empty/i, { timeout: 15_000 });
  });

  test("checkout up to the payment boundary: validation, order creation, payment error, no outbound request", async ({ page }) => {
    await createUserAndLogin(page, email);
    const external: string[] = [];
    page.on("request", (r) => { if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(r.url()) && !/^(data|blob):/.test(r.url())) external.push(r.url()); });
    await page.goto("/bag");
    await page.getByRole("link", { name: /checkout/i }).or(page.getByRole("button", { name: /^checkout$/i })).first().click();
    await expect(page).toHaveURL(/\/checkout/);
    const submit = page.locator("button[type=submit]");
    await expect(submit).toBeDisabled(); // terms not accepted
    await page.getByRole("textbox", { name: "Full name" }).fill("Journey Buyer");
    await page.getByRole("textbox", { name: "Email" }).fill("not-an-email");
    await page.locator("#checkout-phone").fill("1001234567");
    await page.getByRole("textbox", { name: "Street address" }).fill("1 Test Street");
    await page.getByRole("textbox", { name: "City", exact: true }).fill("Cairo");
    await page.getByLabel(/i agree to the terms/i).check();
    await submit.click();
    await expect(page).toHaveURL(/\/checkout/); // an invalid e-mail address never gets as far as an order
    await expect(page.locator("main")).not.toContainText(/we couldn.t start your payment/i);
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await submit.click();
    await expect(page.getByText(/we couldn.t start your payment/i)).toBeVisible({ timeout: 30_000 });
    expect(external, "nothing may leave localhost").toEqual([]);
    await page.goto("/orders");
    await expect(page.locator("main")).toContainText(/payment pending/i);
    await expect(page.getByRole("button", { name: /complete payment/i }).or(page.getByRole("link", { name: /complete payment/i })).first()).toBeVisible();
  });

  test("account menu, order history, logout, protected pages, and login through the login page", async ({ page }) => {
    await createUserAndLogin(page, email);
    await page.goto("/");
    await settle(page);
    await openAccountMenu(page, email);
    await expect(page.getByText(/^my orders$/i).first()).toBeVisible();
    await expect(page.getByText(/^wishlist$/i).first()).toBeVisible();
    await page.getByText(/^my orders$/i).first().click();
    await expect(page).toHaveURL(/\/orders/);
    await expect(page.getByRole("heading", { name: /my orders/i })).toBeVisible();
    // the order opens
    const href = await page.locator('a[href^="/orders/"]').first().getAttribute("href");
    expect(href, "the order has a detail link").toBeTruthy();
    await page.goto(href!);
    await expect(page.locator("main")).toContainText(/TGFM-/);
    // sign out through the menu
    await page.goto("/");
    await settle(page);
    await openAccountMenu(page, email);
    // Wait for the sign-out request itself before looking at the session: a session request sent at the same instant is answered with a
    // refreshed cookie that lands AFTER the sign-out's "clear" and silently signs the user in again (seen in a trace: both started in
    // the same millisecond). That is how a session poll behaves, not a sign-out failure.
    const signedOut = page.waitForResponse((r) => r.url().includes("/api/auth/signout") && r.request().method() === "POST");
    await page.getByText(/^sign out$/i).first().click();
    await signedOut;
    await settle(page);
    await expect.poll(async () => (await (await page.request.get("/api/auth/session")).json())?.user ?? null, { timeout: 15_000 }).toBeNull();
    // The app itself navigates to "/" right after signing out; a goto issued meanwhile is interrupted by it ("interrupted by another
    // navigation") and is simply issued again.
    await expect(async () => { await page.goto("/orders"); }).toPass({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
    await expect(async () => { await page.goto("/wishlist"); }).toPass({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
    await loginViaPage(page, email, PASSWORD, "/login?callbackUrl=/orders");
    await expect(page).toHaveURL(/\/orders/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /my orders/i })).toBeVisible();
  });

  test("upload of an artwork file works with a large (but valid) image", async ({ page }) => {
    await createUserAndLogin(page, uniqueEmail("big"));
    await openDesigner(page);
    await uploadAndPlace(page, { name: "big.png", mimeType: "image/png", buffer: await artworkPng(3000, 2500) });
  });
});
