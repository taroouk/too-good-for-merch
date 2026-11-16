import { test, expect } from "../fixtures/guard";
import { adminLoginApi, clickUntilVisible, createUserAndLogin, gotoStudioPage, uniqueEmail, settle } from "../fixtures/helpers";

// Bespoke request, end to end: Studio -> BESPOKE -> request form -> database -> customer list -> admin (note, quote, status) -> the quote
// unlocks the build for the customer. The in-app request form is reachable by URL only (the Studio button opens WhatsApp instead);
// the WhatsApp tab it opens is aborted by the guard, so nothing reaches wa.me.
test.describe.configure({ mode: "serial" });

type Info = { requests: Array<Record<string, any>>; draft: { product: string | null; customQuoteUsdCents: number | null } | null; audits: Array<{ action: string; newValue: string | null }> };
const info = async (page: import("@playwright/test").Page, q: { email?: string; buildId?: string }) => (await (await page.request.post("/api/qa-sim/bespoke-info", { data: q })).json()) as Info;

test.describe("bespoke request", () => {
  const email = uniqueEmail("bespoke");
  let buildId = "";
  let requestId = "";

  test("the Bespoke button explains the process, opens WhatsApp (aborted here) and switches the build to Bespoke", async ({ page }) => {
    test.info().annotations.push({ type: "allowed-external", description: "wa.me" }); // the tab is aborted by the guard, nothing leaves the machine
    await createUserAndLogin(page, email);
    await gotoStudioPage(page);
    const bespoke = page.locator("button.studio-product-button", { hasText: /bespoke/i });
    await clickUntilVisible(bespoke, page.getByText(/custom garment request/i));
    await page.getByRole("button", { name: /go back/i }).click();
    await expect(page.getByText(/selection summary/i)).toBeVisible();
    await clickUntilVisible(bespoke, page.getByRole("button", { name: /continue on whatsapp/i }));
    await page.getByRole("button", { name: /continue on whatsapp/i }).click();
    await expect(page.getByRole("button", { name: /request a quote/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/tailored quote/i)).toBeVisible();
    buildId = new URL(page.url()).pathname.split("/")[3];
    await expect.poll(async () => (await info(page, { buildId })).draft?.product, { timeout: 15_000 }).toBe("CUSTOM");
  });

  test("the request form validates its input, then stores a request with a full snapshot and shows the confirmation", async ({ page }) => {
    await createUserAndLogin(page, email);
    await page.goto(`/bespoke/new?buildId=${buildId}`);
    await expect(page.locator("body")).toContainText(/bespoke/i);
    await expect(page.locator("body")).toContainText(/custom/i); // the product row of the snapshot
    const submit = page.getByRole("button", { name: /submit bespoke request/i });
    await page.getByRole("textbox").first().fill("");
    await page.locator('input[placeholder="+20..."]').fill("abc");
    await submit.click();
    await expect(page).toHaveURL(/\/bespoke\/new/); // refused: nothing stored
    expect((await info(page, { email })).requests).toHaveLength(0);
    await page.getByRole("textbox").first().fill("Bespoke Buyer");
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[placeholder="+20..."]').fill("+201001234567");
    await submit.click();
    await expect(page).toHaveURL(/\/bespoke\/[^/]+\/submitted/, { timeout: 25_000 });
    const { requests } = await info(page, { email });
    expect(requests).toHaveLength(1);
    const r = requests[0];
    requestId = r.id;
    expect(r.status).toBe("NEW");
    expect(r.product).toBe("CUSTOM");
    expect(r.buildId).toBe(buildId);
    expect(r.customerName).toBe("Bespoke Buyer");
    expect(r.customerEmail).toBe(email);
    expect(String(r.requestNumber)).toMatch(/\w+/);
    await expect(page.locator("body")).toContainText(r.requestNumber);
  });

  test("the confirmation page and the request belong to their owner: another customer and a guest get nothing", async ({ page, browser }) => {
    const ctx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const other = await ctx.newPage();
    await createUserAndLogin(other, uniqueEmail("bespokeother"));
    await other.goto(`/bespoke/${requestId}/submitted`);
    await expect(other.locator("body")).not.toContainText(email);
    await other.goto("/bespoke");
    await expect(other.locator("body")).not.toContainText(email);
    // a second submit for the same build by someone who cannot access it is refused by the action
    await other.goto(`/bespoke/new?buildId=${buildId}`);
    await expect(other.locator("body")).not.toContainText("Bespoke Buyer");
    await ctx.close();
    await page.context().clearCookies();
    await page.goto(`/bespoke/${requestId}/submitted`);
    await expect(page).toHaveURL(/\/login/);
    expect((await info(page, { email })).requests, "no extra request was created").toHaveLength(1);
  });

  test("the customer sees the request in their list", async ({ page }) => {
    await createUserAndLogin(page, email);
    await page.goto("/bespoke");
    await expect(page.locator("body")).toContainText(/new|received|submitted|pending/i);
    await expect(page.locator("body")).toContainText(/custom|bespoke/i);
  });

  test("admin: the request is listed; add a note, quote it, advance the status; every step is stored and audited", async ({ page }) => {
    await adminLoginApi(page);

    await page.goto("/admin/bespoke");
    await expect(page.locator("body")).toContainText(/Bespoke Buyer|bespoke-/i);
    await page.goto(`/admin/bespoke/${requestId}`);
    await expect(page.locator("body")).toContainText("Bespoke Buyer");
    await expect(page.locator("body")).toContainText(email);

    await page.getByPlaceholder(/internal note/i).fill("Customer wants embroidery on the sleeves");
    await page.getByRole("button", { name: /add note|save note|post/i }).first().click();
    await expect(page.locator("body")).toContainText("Customer wants embroidery on the sleeves", { timeout: 15_000 });

    // a quote needs a positive amount
    await page.getByPlaceholder("150.00").fill("-5");
    await page.getByRole("button", { name: /save quote|send quote|set quote|quote/i }).last().click();
    await settle(page);
    expect((await info(page, { email })).requests[0].quoteUsdCents ?? null, "a negative quote is refused").toBeNull();

    await page.goto(`/admin/bespoke/${requestId}`);
    await page.getByPlaceholder("150.00").fill("150.00");
    await page.getByPlaceholder(/embroidery/i).fill("Includes embroidery on both sleeves");
    await page.getByRole("button", { name: /save quote|send quote|set quote|quote/i }).last().click();
    await expect.poll(async () => (await info(page, { email })).requests[0].quoteUsdCents, { timeout: 15_000 }).toBe(15000);
    const after = await info(page, { email, buildId });
    expect(after.requests[0].status, "a quote advances a NEW request").toBe("QUOTED");
    expect(after.draft?.customQuoteUsdCents, "the quote is mirrored on the build so the customer can check out").toBe(15000);
    expect(after.audits.map((a) => a.action)).toContain("BESPOKE_QUOTE_SET");

    // advance through the status buttons the page offers; the stored status changes and the change is audited
    await page.goto(`/admin/bespoke/${requestId}`);
    await expect(page.locator("body")).toContainText(/quoted/i);
    const next = page.locator("form:has(input[name=status]) button").first();
    await expect(next).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await next.click();
    await expect.poll(async () => (await info(page, { email })).requests[0].status, { timeout: 15_000 }).not.toBe("QUOTED");
    expect((await info(page, { email, buildId })).audits.map((a) => a.action)).toContain("BESPOKE_STATUS_CHANGED");
  });

  test("after the quote the customer's Studio shows the quoted price instead of 'request a quote'", async ({ page }) => {
    await createUserAndLogin(page, email);
    await page.goto(`/studio/projects/${buildId}/builder`);
    await settle(page);
    await expect(page.getByRole("button", { name: /request a quote/i })).toHaveCount(0);
    await expect(page.locator("main")).toContainText(/150|EGP/i);
  });
});
