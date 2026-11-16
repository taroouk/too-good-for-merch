import { test, expect } from "../fixtures/guard";
import { PASSWORD, createUserAndLogin, loginViaPage, uniqueEmail, settle } from "../fixtures/helpers";

// Signup, login, logout, session persistence, validation, duplicate addresses and the password-reset pages (UI level).
// The public signup is rate limited to 5 per 10 minutes per IP, so this file signs up through the UI at most twice.
test.describe("authentication", () => {
  test("signup through the registration page signs the new user in; the session survives reloads and a second tab", async ({ page, context }) => {
    const email = uniqueEmail("signup");
    await page.goto("/register");
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /^create$/i }).click();
    await expect(page).not.toHaveURL(/\/register/, { timeout: 25_000 });
    expect((await (await page.request.get("/api/auth/session")).json()).user.email).toBe(email);
    // The page signup navigated to may still be loading (the URL changes before it has loaded): a reload issued meanwhile is aborted
    // ("net::ERR_ABORTED"). Let it settle, and issue the (idempotent) reload again if a navigation still unwinds.
    await settle(page);
    await expect(async () => { await page.reload(); }).toPass({ timeout: 15_000 });
    expect((await (await page.request.get("/api/auth/session")).json()).user.email).toBe(email);
    const second = await context.newPage();
    await second.goto("/orders");
    await expect(second).toHaveURL(/\/orders/); // a second tab shares the session
  });

  test("registration validation: short password, malformed address; the browser form stops them before the server", async ({ page }) => {
    await page.goto("/register");
    await page.locator('input[type="email"]').fill("not-an-email");
    await page.locator('input[type="password"]').fill("short");
    await page.getByRole("button", { name: /^create$/i }).click();
    await expect(page).toHaveURL(/\/register/);
    const invalid = await page.locator("input:invalid").count();
    expect(invalid).toBeGreaterThanOrEqual(1);
  });

  test("registering an address that already exists shows the same neutral outcome as a new one; it never says the address is taken", async ({ page }) => {
    const email = uniqueEmail("dup");
    await createUserAndLogin(page, email);
    await page.context().clearCookies();
    await page.goto("/register");
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill("a-different-password-9");
    await page.getByRole("button", { name: /^create$/i }).click();
    await expect(page.getByText(/couldn.t create your account or sign you in/i)).toBeVisible({ timeout: 25_000 });
    await expect(page.locator("body")).not.toContainText(/already (registered|in use|exists|taken)|in use/i);
    // ... and it did not change the existing account's password
    await loginViaPage(page, email, PASSWORD);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
  });

  test("login: empty fields, wrong password, success with redirect to the requested page, logout", async ({ page }) => {
    const email = uniqueEmail("login");
    await page.request.post("/api/qa-sim/make-user", { data: { email, password: PASSWORD } });
    await page.goto("/login?callbackUrl=/wishlist");
    await page.getByRole("button", { name: /^(log ?in|sign ?in)$/i }).click();
    await expect(page).toHaveURL(/\/login/); // browser validation: nothing submitted
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill("wrong-password-1");
    await page.getByRole("button", { name: /^(log ?in|sign ?in)$/i }).click();
    await expect(page.locator("[role=alert], .error").first()).toBeVisible({ timeout: 15_000 });
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /^(log ?in|sign ?in)$/i }).click();
    await expect(page).toHaveURL(/\/wishlist/, { timeout: 20_000 });
    const csrf = (await (await page.request.get("/api/auth/csrf")).json()).csrfToken;
    await page.request.post("/api/auth/signout", { form: { csrfToken: csrf, json: "true" } });
    await page.goto("/wishlist");
    await expect(page).toHaveURL(/\/login/);
  });

  test("an open redirect through callbackUrl is not honoured", async ({ page }) => {
    const email = uniqueEmail("redir");
    await page.request.post("/api/qa-sim/make-user", { data: { email, password: PASSWORD } });
    await page.goto("/login?callbackUrl=https://evil.example/phish");
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /^(log ?in|sign ?in)$/i }).click();
    await settle(page);
    await expect.poll(() => new URL(page.url()).hostname, { timeout: 20_000 }).not.toBe("evil.example");
  });

  test("forgot-password page: the same confirmation for any address; reset page rejects a bad token", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.locator('input[type="email"]').fill(`nobody-${Date.now()}@tgfm.test`);
    await page.getByRole("button", { name: /send|reset|submit|continue/i }).click();
    await expect(page.getByText(/if (an )?account|check your (email|inbox)|we.ve sent|link/i).first()).toBeVisible({ timeout: 15_000 });
    await page.goto("/reset-password?token=not-a-real-token&email=nobody%40tgfm.test");
    await page.locator('input[type="password"]').first().fill("a-brand-new-password-1");
    const confirm = page.locator('input[type="password"]').nth(1);
    if (await confirm.count()) await confirm.fill("a-brand-new-password-1");
    await page.getByRole("button", { name: /reset|save|update|change|submit/i }).click();
    await expect(page.getByText(/invalid or has expired|invalid|expired/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
