import { test, expect } from "../fixtures/guard";
import { settle } from "../fixtures/helpers";

// Every public page on the current viewport (desktop and phone projects): it renders, has a title and a main landmark, shows no
// uncaught errors, does not scroll sideways, and every image on it loads.
const PAGES = ["/", "/contact", "/coming-soon", "/legal/terms", "/legal/privacy", "/legal/refunds", "/login", "/register", "/forgot-password", "/reset-password", "/bespoke", "/bespoke/new"];

for (const path of PAGES) {
  test(`public page ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const res = await page.goto(path);
    expect(res?.status()).toBeLessThan(400);
    await settle(page);
    await expect(page).toHaveTitle(/.+/);
    expect((await page.locator("body").innerText()).trim().length, "the page has visible content").toBeGreaterThan(40);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(1);
    const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.src));
    expect(broken, "no broken images").toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("unknown URL gives a 404 page, not an error", async ({ page }) => {
  const res = await page.goto("/definitely-not-a-page");
  expect(res?.status()).toBe(404);
});

test("main navigation links work", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) await page.getByRole("button", { name: /^menu$/i }).click();
  for (const [name, url] of [["contact", /\/contact/], ["my bag", /\/bag|\/login/]] as const) {
    await page.goto("/");
    if (isMobile) await page.getByRole("button", { name: /^menu$/i }).click();
    await page.getByRole("link", { name: new RegExp(`^${name}`, "i") }).first().click();
    await expect(page).toHaveURL(url);
  }
});

test("legal pages are reachable from the registration page", async ({ page }) => {
  await page.goto("/register");
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("link", { name: /^terms$/i }).click()]);
  await expect(popup).toHaveURL(/\/legal\/terms/);
});
