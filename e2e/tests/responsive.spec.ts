import { test, expect } from "../fixtures/guard";
import type { Page } from "@playwright/test";
import { adminLoginApi, createUserAndLogin, openDesigner, uniqueEmail, uploadAndPlace, settle } from "../fixtures/helpers";

// Every page at five screen sizes (phone small/large, tablet portrait, small laptop, desktop): no horizontal scroll, no broken image, no
// uncaught error, no console error, no failed or 4xx/5xx request (apart from the ones a page makes on purpose). Findings are collected for
// the whole page list and reported together.
const SIZES = [[320, 568], [375, 812], [768, 1024], [1024, 768], [1440, 900]] as const;
const PUBLIC = ["/", "/studio", "/portfolio", "/contact", "/coming-soon", "/legal/terms", "/legal/privacy", "/legal/refunds", "/login", "/register", "/forgot-password", "/bespoke"];
const CUSTOMER = ["/bag", "/wishlist", "/orders", "/bespoke/new", "/studio/projects"];
const ADMIN = ["/admin", "/admin/orders", "/admin/users", "/admin/products", "/admin/pricing", "/admin/payments", "/admin/projects", "/admin/artworks", "/admin/bespoke", "/admin/audit", "/admin/settings", "/admin/system", "/admin/team", "/admin/legal"];
// Requests that legitimately answer 4xx (an anonymous visitor asking who they are, a deliberately unknown URL, ...).
const EXPECTED = [/\/api\/auth\/session$/, /\/favicon/];

async function sweep(page: Page, paths: string[]) {
  const problems: string[] = [];
  let where = "";
  page.on("pageerror", (e) => problems.push(`${where} pageerror: ${String(e).slice(0, 160)}`));
  // next-auth logs CLIENT_FETCH_ERROR "Failed to fetch" when the browser cancels its session request because the sweep moves to the next page;
  // a real session failure is still caught by the response / requestfailed listeners below.
  page.on("console", (m) => { if (m.type() === "error" && !/CLIENT_FETCH_ERROR[\s\S]*Failed to fetch/.test(m.text())) problems.push(`${where} console.error: ${m.text().slice(0, 160)}`); });
  page.on("requestfailed", (r) => { if (!/ERR_ABORTED/.test(r.failure()?.errorText ?? "")) problems.push(`${where} request failed: ${r.url().slice(0, 100)} ${r.failure()?.errorText}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !EXPECTED.some((re) => re.test(new URL(r.url()).pathname)) && new URL(r.url()).origin === new URL(page.url() || "http://localhost").origin) problems.push(`${where} HTTP ${r.status()}: ${r.url().slice(0, 100)}`); });
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    for (const path of paths) {
      where = `${w}x${h} ${path}`;
      const res = await page.goto(path).catch((e) => { problems.push(`${where} goto failed: ${String(e).slice(0, 100)}`); return null; });
      if (!res) continue;
      if (res.status() >= 400) problems.push(`${where} page status ${res.status()}`);
      await page.waitForLoadState("load");
      await settle(page); // bounded: in a production build router prefetch streams keep a page from ever being "idle" // leave only once the page's own requests (session check, ...) are done, or the navigation cancels them and logs a fetch error
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) problems.push(`${where} sideways scroll of ${overflow}px`);
      const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.src.slice(-60)));
      if (broken.length) problems.push(`${where} broken images: ${broken.join(", ")}`);
      const empty = (await page.locator("body").innerText()).trim().length < 20;
      if (empty) problems.push(`${where} renders blank`);
    }
  }
  return problems;
}

test.describe("responsive, console and network sweep", () => {
  test.setTimeout(900_000);
  test("public pages", async ({ page }) => { expect(await sweep(page, PUBLIC)).toEqual([]); });
  test("signed-in customer pages", async ({ page }) => { await createUserAndLogin(page, uniqueEmail("resp")); expect(await sweep(page, CUSTOMER)).toEqual([]); });
  test("admin pages", async ({ page }) => { await adminLoginApi(page); expect(await sweep(page, ADMIN)).toEqual([]); });

  test("the designer popup with an artwork placed, at every size: usable controls, no sideways scroll, no errors", async ({ page }) => {
    test.setTimeout(120_000);
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 160)}`));
    await createUserAndLogin(page, uniqueEmail("pop"));
    await openDesigner(page);
    await uploadAndPlace(page);
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) problems.push(`${w}x${h} sideways scroll of ${overflow}px`);
      for (const [name, locator] of [["Save T-shirt", page.getByRole("button", { name: /save t-shirt/i }).first()], ["Upload artwork", page.getByRole("button", { name: /^upload artwork$/i }).first()], ["Close", page.getByRole("button", { name: /close bespoke builder/i }).first()]] as const) {
        await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => undefined);
        if (!(await locator.isVisible().catch(() => false))) { problems.push(`${w}x${h} "${name}" is not visible`); continue; }
        const box = await locator.boundingBox();
        if (!box || box.x < -1 || box.x + box.width > w + 1) problems.push(`${w}x${h} "${name}" sticks out of the screen (${JSON.stringify(box)})`);
        if (box && (box.height < 30 && w < 800)) problems.push(`${w}x${h} "${name}" is only ${Math.round(box.height)}px tall to tap`);
      }
    }
    expect(problems).toEqual([]);
  });
});
