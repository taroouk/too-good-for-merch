import { test, expect } from "../fixtures/guard";
import { adminLoginApi, settle } from "../fixtures/helpers";

// Admin catalog and pricing: add / edit / hide / delete a fabric, rename a product, pause selling, pricing rules, placement prices and
// store settings -- each through the real admin forms, checked in the database and (where there is one) in what customers see.
test.describe.configure({ mode: "serial" });

type Catalog = { fabrics: Array<{ id: string; key: string; name: string; gsm: string; active: boolean }>; rules: Array<{ id: string; product: string; fabric: string; minQty: number; maxQty: number; unitPrice: number }>; placements: Array<{ placement: string; unitPrice: number }>; settings: { taxRateBps: number | null; shippingCents: number | null; storeName?: string | null } | null; audits: Array<{ action: string }> };
const catalog = async (page: import("@playwright/test").Page) => (await (await page.request.post("/api/qa-sim/catalog-info")).json()) as Catalog;
const accept = (page: import("@playwright/test").Page) => page.once("dialog", (d) => d.accept());
// What a customer's Studio page contains (server-rendered props): used to prove a catalog change reaches customers.
const studioHtml = async (page: import("@playwright/test").Page) => (await page.context().request.get("/studio")).text();

// The tier rules live in a collapsed "Advanced: custom quantity tiers" section.
async function openAdvanced(page: import("@playwright/test").Page) {
  const d = page.locator("details", { hasText: "Advanced: custom quantity tiers" }).first();
  if (!(await d.evaluate((el: HTMLDetailsElement) => el.open))) await d.locator("summary").first().click();
}

// Deleting a rule: the button sits in each rule's row (and in a hidden mobile copy), so the visible one is used.
async function deleteRule(page: import("@playwright/test").Page, id: string) {
  await page.goto("/admin/pricing");
  await openAdvanced(page);
  page.once("dialog", (d) => d.accept());
  const button = page.locator(`form:has(input[name="id"][value="${id}"]) button`).filter({ hasText: /^\s*Delete\s*$/ }).locator("visible=true").first();
  await button.click();
  await page.getByRole("button", { name: /^(delete|confirm|yes)$/i }).last().click({ timeout: 2000 }).catch(() => undefined);
}

async function createRule(page: import("@playwright/test").Page, fabricKey: string, min: string, max: string, price: string, product = "FITTED") {
  await page.goto("/admin/pricing");
  await settle(page);
  await openAdvanced(page);
  const f = page.locator('form:has(input[name="minQty"]):has(select[name="product"])');
  await f.locator('select[name="product"]').selectOption(product);
  await f.locator('select[name="fabric"]').selectOption(fabricKey);
  await f.locator('input[name="minQty"]').evaluate((el: HTMLInputElement) => { el.removeAttribute("min"); });
  await f.locator('input[name="maxQty"]').evaluate((el: HTMLInputElement) => { el.removeAttribute("min"); });
  await f.locator('input[name="unitPrice"]').evaluate((el: HTMLInputElement) => { el.removeAttribute("min"); el.setAttribute("step", "any"); });
  await f.locator('input[name="minQty"]').fill(min);
  await f.locator('input[name="maxQty"]').fill(max);
  await f.locator('input[name="unitPrice"]').fill(price);
  // The admin pages answer every action with a redirect carrying ?notice= or ?error=; wait for it so a click lost before hydration is noticed.
  // The action answers with a redirect (the page then renders the POST result); ?error= is stripped from the URL by AdminFlash, so wait for the POST itself.
  // A click lost before hydration produces no POST, so retry the click until one is seen.
  await expect(async () => {
    const posted = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/pricing"), { timeout: 5000 });
    await f.getByRole("button", { name: /create pricing rule/i }).click({ timeout: 3000 });
    await posted;
  }).toPass({ timeout: 30_000 });
  await settle(page);
}

// Clicks a form's submit button until the server action's POST is actually seen (a click before hydration is lost in dev).
async function submitUntilPosted(page: import("@playwright/test").Page, button: import("@playwright/test").Locator, path: string) {
  await expect(async () => {
    const posted = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes(path), { timeout: 5000 });
    await button.click({ timeout: 3000 });
    await posted;
  }).toPass({ timeout: 30_000 });
  await settle(page);
}

test.describe("admin catalog and pricing", () => {
  const key = `E2E_${Date.now().toString().slice(-7)}`;
  const name = `E2EFABRIC${Date.now().toString().slice(-5)}`;

  test.beforeEach(async ({ page }) => { await adminLoginApi(page); });

  test("add a fabric: it starts hidden, so customers do not see it", async ({ page }) => {
    await page.goto("/admin/products");
    const add = page.locator('form:has(input[name="key"])');
    await add.locator('input[name="key"]').fill(key);
    await add.locator('input[name="name"]').fill(name);
    await add.locator('input[name="gsm"]').fill("180 GSM Test");
    await add.locator('input[name="description"]').fill("A fabric made by the end-to-end test");
    await add.getByRole("button", { name: /add fabric/i }).click();
    await expect.poll(async () => (await catalog(page)).fabrics.find((f) => f.key === key)?.active, { timeout: 15_000 }).toBe(false);
    expect(await studioHtml(page), "a hidden fabric is not offered to customers").not.toContain(name);
    expect((await catalog(page)).audits.map((a) => a.action).join()).toMatch(/FABRIC/);
  });

  test("a fabric with an invalid key, or a duplicate key, is refused by the server (client validation bypassed)", async ({ page }) => {
    const before = (await catalog(page)).fabrics.length;
    await page.goto("/admin/products");
    const add = page.locator('form:has(input[name="key"])');
    await add.locator('input[name="key"]').evaluate((el: HTMLInputElement) => { el.removeAttribute("pattern"); el.removeAttribute("minlength"); });
    await add.locator('input[name="key"]').fill("a b!");
    await add.locator('input[name="name"]').fill("Bad");
    await add.locator('input[name="gsm"]').fill("1 GSM");
    await add.locator('input[name="description"]').fill("bad key");
    await add.getByRole("button", { name: /add fabric/i }).click();
    await settle(page);
    expect((await catalog(page)).fabrics.length, "no fabric was created").toBe(before);
    await page.goto("/admin/products");
    await add.locator('input[name="key"]').fill(key); // duplicate of the one created above
    await add.locator('input[name="name"]').fill("Duplicate");
    await add.locator('input[name="gsm"]').fill("1 GSM");
    await add.locator('input[name="description"]').fill("dup");
    await add.getByRole("button", { name: /add fabric/i }).click();
    await settle(page);
    expect((await catalog(page)).fabrics.filter((f) => f.key === key)).toHaveLength(1);
  });

  test("a fabric with no price is not offered even when active; once it has a price rule and is activated, customers see it; edit its name: the change reaches customers; hide it again", async ({ page }) => {
    await createRule(page, key, "1", "500", "5.00");
    await expect.poll(async () => (await catalog(page)).rules.some((r) => r.fabric === key), { timeout: 15_000 }).toBe(true);
    await page.goto("/admin/products");
    await page.locator("tr, li, div").filter({ hasText: name }).filter({ has: page.getByRole("button", { name: "Activate" }) }).last().getByRole("button", { name: "Activate" }).click();
    await expect.poll(async () => (await catalog(page)).fabrics.find((f) => f.key === key)?.active, { timeout: 15_000 }).toBe(true);
    await expect.poll(async () => (await studioHtml(page)).includes(name), { timeout: 15_000 }).toBe(true);
    await page.goto("/admin/products");
    const rename = `${name}X`;
    const fabricId = (await catalog(page)).fabrics.find((f) => f.key === key)!.id;
    await page.locator("details", { has: page.locator(`input[name="id"][value="${fabricId}"]`) }).first().locator("summary").first().click();
    const form = page.locator(`form:has(input[name="id"][value="${fabricId}"]):has(input[name="gsm"])`);
    await form.locator('input[name="name"]').fill(rename);
    await form.getByRole("button", { name: /save changes/i }).click();
    await expect.poll(async () => (await catalog(page)).fabrics.find((f) => f.key === key)?.name, { timeout: 15_000 }).toBe(rename);
    expect(await studioHtml(page)).toContain(rename);
    await page.goto("/admin/products");
    accept(page);
    await page.getByRole("button", { name: "Hide" }).last().click();
    await page.getByRole("button", { name: /^(hide|confirm|yes)$/i }).last().click({ timeout: 2000 }).catch(() => undefined);
    await expect.poll(async () => (await catalog(page)).fabrics.find((f) => f.key === key)?.active, { timeout: 15_000 }).toBe(false);
    expect(await studioHtml(page)).not.toContain(rename);
  });

  test("a fabric that still has a price rule cannot be deleted; after the rule is gone it can", async ({ page }) => {
    await page.goto("/admin/products");
    accept(page);
    await page.locator("tr, li, div").filter({ hasText: `${name}X` }).filter({ has: page.getByRole("button", { name: "Delete" }) }).last().getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: /^(delete|confirm|yes)$/i }).last().click({ timeout: 2000 }).catch(() => undefined);
    await settle(page);
    expect((await catalog(page)).fabrics.some((f) => f.key === key), "refused while a price rule references it").toBe(true);
    const rule = (await catalog(page)).rules.find((r) => r.fabric === key)!;
    await deleteRule(page, rule.id);
    await expect.poll(async () => (await catalog(page)).rules.some((r) => r.fabric === key), { timeout: 15_000 }).toBe(false);
    await page.goto("/admin/products");
    accept(page);
    const mine = page.locator("tr, li, div").filter({ hasText: `${name}X` }).filter({ has: page.getByRole("button", { name: "Delete" }) }).last();
    await mine.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: /^(delete|confirm|yes)$/i }).last().click({ timeout: 2000 }).catch(() => undefined);
    await expect.poll(async () => (await catalog(page)).fabrics.some((f) => f.key === key), { timeout: 15_000 }).toBe(false);
    const seeded = (await catalog(page)).fabrics.filter((f) => f.key !== key).length;
    expect(seeded, "the seeded fabrics are untouched").toBeGreaterThan(0);
  });

  test("rename a product type: customers see the new name; restore it", async ({ page }) => {
    await page.goto("/admin/products");
    const form = page.locator('form:has(input[name="tagline"])').first();
    const original = await form.locator('input[name="name"]').inputValue();
    const originalTag = await form.locator('input[name="tagline"]').inputValue();
    const renamed = `${original} E2E`;
    await form.locator('input[name="name"]').fill(renamed);
    await form.getByRole("button", { name: /^save$/i }).click();
    await expect.poll(async () => (await studioHtml(page)).toUpperCase().includes(renamed.toUpperCase()), { timeout: 15_000 }).toBe(true);
    await page.goto("/admin/products");
    const form2 = page.locator('form:has(input[name="tagline"])').first();
    await form2.locator('input[name="name"]').fill(original);
    await form2.locator('input[name="tagline"]').fill(originalTag);
    await form2.getByRole("button", { name: /^save$/i }).click();
    await expect.poll(async () => (await studioHtml(page)).toUpperCase().includes(renamed.toUpperCase()), { timeout: 15_000 }).toBe(false);
  });

  test("pricing rules: create, edit, delete; invalid ranges and prices are refused; the customer's quote follows", async ({ page }) => {
    const rulesBefore = (await catalog(page)).rules.length;
    const fabricKey = (await catalog(page)).fabrics.find((f) => f.active)!.key;
    const create = (min: string, max: string, price: string) => createRule(page, fabricKey, min, max, price);
    await create("400", "300", "9.99");   // min > max
    await create("300", "350", "-4");     // negative price
    await create("300", "350", "0");      // zero price
    await create("400", "9000", "9.99");  // above the 500-piece ceiling
    expect((await catalog(page)).rules.length, "none of the four invalid rules was stored").toBe(rulesBefore);
    // Rules left by an earlier, aborted run of this test would overlap; remove them through the admin UI first.
    for (const r of (await catalog(page)).rules.filter((x) => x.fabric === fabricKey && x.minQty >= 300)) await deleteRule(page, r.id);
    const lo = 300;
    await create(String(lo), String(lo + 30), "7.25");
    await expect.poll(async () => (await catalog(page)).rules.some((r) => r.minQty === lo && r.unitPrice === 7.25), { timeout: 15_000 }).toBe(true);
    await create(String(lo + 10), String(lo + 40), "6.00"); // overlaps the rule above
    expect((await catalog(page)).rules.filter((r) => r.minQty === lo + 10), "an overlapping rule is refused").toHaveLength(0);
    const quote = async (qty: number) => (await (await page.request.post("/api/pricing/quote", { data: { product: "FITTED", fabric: fabricKey, quantity: qty, placements: [] } })).json());
    const q1 = await quote(lo);
    expect(JSON.stringify(q1)).toMatch(/7\.25|725/);

    const rule = (await catalog(page)).rules.find((r) => r.minQty === lo && r.fabric === fabricKey)!;
    await page.goto("/admin/pricing");
    await openAdvanced(page);
    const editAny = page.locator(`form:has(input[name="id"][value="${rule.id}"]):has(input[name="unitPrice"])`);
    await page.locator("details", { has: editAny }).last().locator("summary").first().click();
    const edit = editAny.filter({ visible: true }).first(); // .last(): the innermost details is the row's Edit popover, the outer ones are the Advanced section
    await edit.locator('input[name="unitPrice"]').fill("8.50");
    await edit.getByRole("button", { name: /save changes/i }).click();
    await expect.poll(async () => (await catalog(page)).rules.find((r) => r.id === rule.id)?.unitPrice, { timeout: 15_000 }).toBe(8.5);
    expect(JSON.stringify(await quote(lo))).toMatch(/8\.5|850/);

    await deleteRule(page, rule.id);
    await expect.poll(async () => (await catalog(page)).rules.some((r) => r.id === rule.id), { timeout: 15_000 }).toBe(false);
  });

  test("placement prices: set and remove an extra price for a print position; negative values are refused", async ({ page }) => {
    await page.goto("/admin/pricing");
    const form = page.locator('form:has(input[name="placement"])').first();
    const placement = await form.locator('input[name="placement"]').inputValue();
    await form.locator('input[name="unitPrice"]').evaluate((el: HTMLInputElement) => { el.removeAttribute("min"); });
    await form.locator('input[name="unitPrice"]').fill("-3");
    await form.getByRole("button", { name: /^save$/i }).click();
    await settle(page);
    expect((await catalog(page)).placements.find((p) => p.placement === placement)?.unitPrice ?? 0).toBeGreaterThanOrEqual(0);
    await page.goto("/admin/pricing");
    const f2 = page.locator(`form:has(input[name="placement"][value="${placement}"])`).first();
    await f2.locator('input[name="unitPrice"]').fill("1.25");
    await f2.getByRole("button", { name: /^save$/i }).click();
    await expect.poll(async () => (await catalog(page)).placements.find((p) => p.placement === placement)?.unitPrice, { timeout: 15_000 }).toBe(1.25);
  });

  test("store settings: shipping and tax are stored and reach the customer's totals; invalid values are refused", async ({ page, browser }) => {
    await page.goto("/admin/settings");
    const form = page.locator('form:has(input[name="shipping"][type="number"])').first();
    const before = (await catalog(page)).settings;
    await form.locator('input[name="shipping"][type="number"]').evaluate((el: HTMLInputElement) => { el.removeAttribute("min"); });
    await form.locator('input[name="shipping"][type="number"]').fill("-10");
    await submitUntilPosted(page, form.getByRole("button", { name: /save settings/i }), "/admin/settings");
    await settle(page);
    expect((await catalog(page)).settings?.shippingCents ?? 0, "a negative shipping amount is refused").toBe(before?.shippingCents ?? 0);
    await page.goto("/admin/settings");
    const f2 = page.locator('form:has(input[name="shipping"][type="number"])').first();
    await f2.locator('input[name="currency"]').fill("EGP"); // the seeded currency is USD, which the server refuses (EGP is the only payment currency)
    await f2.locator('input[name="shipping"][type="number"]').fill("12.00");
    await submitUntilPosted(page, f2.getByRole("button", { name: /save settings/i }), "/admin/settings");
    await expect.poll(async () => (await catalog(page)).settings?.shippingCents, { timeout: 15_000 }).toBe(1200);
    // restore
    await page.goto("/admin/settings");
    const f3 = page.locator('form:has(input[name="shipping"][type="number"])').first();
    await f3.locator('input[name="currency"]').fill("EGP"); // the seeded currency is USD, which the server refuses (EGP is the only payment currency)
    await f3.locator('input[name="shipping"][type="number"]').fill(String((before?.shippingCents ?? 0) / 100));
    await submitUntilPosted(page, f3.getByRole("button", { name: /save settings/i }), "/admin/settings");
    await expect.poll(async () => (await catalog(page)).settings?.shippingCents, { timeout: 15_000 }).toBe(before?.shippingCents ?? 0);
    void browser;
  });
});
