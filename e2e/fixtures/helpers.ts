import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./guard";

// the app's own sharp (no second copy is installed in this package)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require(path.resolve(__dirname, "../../node_modules/sharp"));

export const uniqueEmail = (tag = "e2e") => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@tgfm.test`.toLowerCase(); // the app lower-cases addresses
export const PASSWORD = "e2e-password-1";
export const SEED_USER = { email: "test@tgfm.test", password: process.env.E2E_TEST_PASSWORD ?? "" };

export async function artworkPng(width = 400, height = 300) {
  return sharp({ create: { width, height, channels: 4, background: { r: 200, g: 30, b: 60, alpha: 1 } } }).png().toBuffer() as Promise<Buffer>;
}

// Studio -> "Build your T-shirt" as a guest opens the sign-in dialog; create an account there and wait for the designer popup.
export async function signupInStudio(page: Page, email = uniqueEmail(), password = PASSWORD) {
  await page.goto("/studio");
  await page.getByRole("button", { name: /build your t-shirt/i }).click();
  await page.getByRole("button", { name: /create account/i }).first().click();
  await page.getByPlaceholder("you@email.com").fill(email);
  await page.getByPlaceholder(/at least 8/i).fill(password);
  await page.getByRole("button", { name: /create account/i }).last().click();
  await expect(page.getByRole("heading", { name: /build your t-shirt/i })).toBeVisible({ timeout: 25_000 });
  return { email, password };
}

export async function uploadAndPlace(page: Page, file?: { name: string; mimeType: string; buffer: Buffer }) {
  const f = file ?? { name: "art.png", mimeType: "image/png", buffer: await artworkPng() };
  await page.locator('input[type="file"]').first().setInputFiles(f);
  const place = page.getByRole("button", { name: /place it/i });
  await expect(place).toBeVisible({ timeout: 20_000 });
  // A click made before the page has finished hydrating is lost (a development server compiles routes on first use), so retry it.
  let attempts = 0;
  await expect(async () => {
    attempts += 1;
    if (await place.isVisible().catch(() => false)) await place.click({ timeout: 3000 });
    await expect(page.getByText(/1 ?\/ ?4/)).toBeVisible({ timeout: 4000 });
  }).toPass({ timeout: 40_000 });
  // A pass that needed a second click is NOT a clean pass: record it so the report can count it.
  if (attempts > 1) test.info().annotations.push({ type: "helper-retry", description: `uploadAndPlace needed ${attempts} attempts` });
}

export async function loginViaPage(page: Page, email: string, password: string, path = "/login") {
  await page.goto(path);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /^(log ?in|sign ?in)$/i }).click();
}

// Creates the user directly (QA route, isolated server only) and signs them in through the real credentials endpoint, so the context
// carries a genuine session cookie. Used instead of the public signup, which is rate limited to 5 per 10 minutes per IP.
export async function createUserAndLogin(page: Page, email = uniqueEmail(), password = PASSWORD) {
  const made = await page.request.post("/api/qa-sim/make-user", { data: { email, password } });
  expect(made.ok()).toBeTruthy();
  await loginApi(page, email, password);
  return { email, password };
}

export async function loginApi(page: Page, email: string, password: string) {
  const csrf = await (await page.request.get("/api/auth/csrf")).json();
  await page.request.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, email, password, json: "true" } });
  const session = await (await page.request.get("/api/auth/session")).json();
  expect(session?.user?.email).toBe(email);
}

// Opens the designer popup for an already signed-in user. A returning customer with an unfinished design is first asked whether to
// continue it or start from a blank T-shirt (the restoration feature); `restore` answers that question.
export async function openDesigner(page: Page, restore: "continue" | "fresh" = "continue") {
  await page.goto("/studio");
  await settle(page);
  const question = page.getByText(/continue your last design/i);
  const heading = page.getByRole("heading", { name: /build your t-shirt/i });
  const open = page.getByRole("button", { name: /build your t-shirt/i }).first();
  // The page may open the designer by itself (returning customer); otherwise click the button, retrying a click that was lost to hydration.
  await expect(async () => {
    if (!(await heading.isVisible().catch(() => false)) && !(await question.isVisible().catch(() => false))) await open.click({ timeout: 3000 });
    await expect(question.or(heading)).toBeVisible({ timeout: 6000 });
  }).toPass({ timeout: 45_000 });
  if (await question.isVisible()) await page.getByRole("button", { name: restore === "continue" ? /^continue$/i : /start fresh/i }).click();
  await expect(heading).toBeVisible({ timeout: 25_000 });
}

// Opens the Studio page for a signed-in user WITHOUT the designer popup: a returning customer with an unfinished design gets the
// popup (and the "continue your last design?" question) opened automatically, so both are dismissed if they appear.
export async function gotoStudioPage(page: Page) {
  await page.goto("/studio");
  await settle(page);
  const question = page.getByText(/continue your last design/i);
  if (await question.isVisible().catch(() => false)) await page.getByRole("button", { name: /^continue$/i }).click();
  const heading = page.getByRole("heading", { name: /build your t-shirt/i });
  if (await heading.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /^(×|close)$/i }).first().click();
    await expect(heading).toBeHidden();
  }
}

// Opens the account menu: the user button in the header on a desktop viewport, the MENU button on a phone.
export async function openAccountMenu(page: Page, email: string) {
  const userButton = page.locator("header button").filter({ hasText: new RegExp(email.slice(0, 6), "i") }).first();
  if (await userButton.isVisible().catch(() => false)) { await userButton.click(); return; }
  await page.getByRole("button", { name: /^menu$/i }).first().click();
}

export function buildIdFromUrl(page: Page) {
  const m = page.url().match(/\/studio\/projects\/([^/]+)\//);
  if (!m) throw new Error(`not on a studio project page: ${page.url()}`);
  return m[1];
}

export async function buildInfo(page: Page, buildId: string) {
  const res = await page.request.post("/api/qa-sim/build-info", { data: { buildId } });
  expect(res.ok()).toBeTruthy();
  return res.json() as Promise<{ buildId: string; ownerId: string | null; draftId: string; aiMockupId: string | null; aiMockupFingerprint: string | null; assets: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number; status: string; cropSourceAssetId: string | null; cropMeta: unknown }>; mockupRows: number }>;
}

// Fills the checkout form for a bag/Buy-Now checkout and presses "Continue to payment". Paymob is not configured in the isolated
// development server, so this creates the order and then stops at the payment boundary with the "couldn't start your payment" message.
export async function checkoutToPaymentBoundary(page: Page, buyer: { name?: string; email: string }) {
  await page.getByRole("textbox", { name: "Full name" }).fill(buyer.name ?? "E2E Buyer");
  await page.getByRole("textbox", { name: "Email" }).fill(buyer.email);
  await page.locator("#checkout-phone").fill("1001234567");
  await page.getByRole("textbox", { name: "Street address" }).fill("1 Test Street");
  await page.getByRole("textbox", { name: "City", exact: true }).fill("Cairo");
  await page.getByLabel(/i agree to the terms/i).check();
  await page.locator("button[type=submit]").click();
  await expect(page.getByText(/we couldn.t start your payment/i)).toBeVisible({ timeout: 30_000 });
}

// A signed-in user with one design in the bag (artwork uploaded, Gemini mockup from the local stub, added to the bag).
export async function userWithBagItem(page: Page, email = uniqueEmail("bag")) {
  await createUserAndLogin(page, email);
  await openDesigner(page);
  await uploadAndPlace(page);
  const buildId = buildIdFromUrl(page);
  await page.getByRole("button", { name: /save t-shirt/i }).click();
  await expect.poll(async () => (await buildInfo(page, buildId)).aiMockupId, { timeout: 60_000 }).not.toBeNull();
  await page.getByRole("button", { name: /add to bag/i }).click();
  await expect(page.getByText(/added to your bag/i)).toBeVisible({ timeout: 15_000 });
  return { email, buildId };
}

// Clicks `trigger` until `target` is visible. A click made before the page has hydrated is lost (a development server compiles each route
// on first use), so the click is repeated -- only for controls whose click is idempotent (opening a dialog).
export async function clickUntilVisible(trigger: import("@playwright/test").Locator, target: import("@playwright/test").Locator, timeout = 40_000) {
  await expect(async () => {
    if (!(await target.isVisible().catch(() => false))) await trigger.click({ timeout: 3000 });
    await expect(target).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout });
}

export const ADMIN_ACCOUNT = { email: "qa-admin@tgfm.test", password: "qa-admin-oEMUOFH58pG8j-Uo" };

// Signing in is limited to 10 attempts per address and IP per 10 minutes, and a suite signs the admin in many times, so the session cookies are
// cached for the worker and re-used: a later test only restores the admin's role in the database (make-admin) and adds the cookies.
let cachedAdminCookies: Awaited<ReturnType<import("@playwright/test").BrowserContext["cookies"]>> | null = null;

// Creates (or restores) the QA admin in the isolated database and signs it in through the real credentials endpoint.
export async function adminLoginApi(page: Page) {
  const made = await page.request.post("/api/qa-sim/make-admin", { data: ADMIN_ACCOUNT });
  expect(made.ok()).toBeTruthy();
  if (cachedAdminCookies) {
    await page.context().addCookies(cachedAdminCookies);
    const session = await (await page.request.get("/api/auth/session")).json();
    if (session?.user?.email === ADMIN_ACCOUNT.email) return;
    cachedAdminCookies = null;
  }
  await loginApi(page, ADMIN_ACCOUNT.email, ADMIN_ACCOUNT.password);
  cachedAdminCookies = await page.context().cookies();
}

// Presses a submit button until the Server Action's POST has actually been SENT (a click before the page has hydrated is lost in dev), then
// waits for that POST's answer and for the page to settle. The retry is decided by "was a request sent", never by "did the answer arrive in
// time": a slow answer (loaded machine) must not cause a second click, which would run a non-idempotent action twice.
export async function submitUntilPosted(page: Page, button: import("@playwright/test").Locator) {
  let sentRequest: import("@playwright/test").Request | undefined;
  await expect(async () => {
    const sent = page.waitForRequest((r) => r.method() === "POST" && !new URL(r.url()).pathname.startsWith("/api/"), { timeout: 5000 });
    await button.click({ timeout: 3000 });
    sentRequest = await sent;
  }).toPass({ timeout: 30_000 });
  await sentRequest!.response(); // waits for the answer (the test's own timeout bounds it)
  await settle(page);
}

// "The page has settled": networkidle, but BOUNDED. In a production build the router prefetches (`?_rsc=` requests, e.g. on a builder
// page) are streams Playwright never sees finish, so an unbounded networkidle wait can never complete there.
export async function settle(page: Page, ms = 4000) {
  await page.waitForLoadState("networkidle", { timeout: ms }).catch(() => undefined);
}
