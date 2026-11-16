import { test, expect } from "../fixtures/guard";
import { stub } from "../fixtures/stub";
import { buildIdFromUrl, buildInfo, createUserAndLogin, gotoStudioPage, openDesigner, uniqueEmail, uploadAndPlace } from "../fixtures/helpers";

// The Gemini route against the LOCAL stub: failure handling in the UI (no silent fallback of any kind), request validation, ownership, and
// concurrent requests. No request ever leaves localhost.
test.describe("Gemini mockup generation (local stub)", () => {
  test.beforeEach(async () => { await stub.reset(); });

  for (const [mode, label] of [["http500", "Gemini answers 500"], ["noimage", "Gemini answers without an image"], ["badimage", "Gemini returns bytes that are not an image"], ["http429", "Gemini answers 429 (quota)"]] as const) {
    test(`${label}: a friendly error, no mockup is stored, nothing stands in for it, and a retry succeeds`, async ({ page }) => {
      await createUserAndLogin(page, uniqueEmail("gf"));
      await openDesigner(page);
      await uploadAndPlace(page);
      const buildId = buildIdFromUrl(page);
      await stub.mode(mode);
      await page.getByRole("button", { name: /save t-shirt/i }).click();
      await expect(page.getByTestId("preview-error")).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId("preview-error")).toContainText(/couldn.t create your preview/i);
      await expect(page.getByTestId("preview-error")).not.toContainText(/stub|api key|googleapis|exception/i); // no technical detail leaks
      await expect(page.getByText(/print (mockup|preview)/i)).toHaveCount(0);
      const info = await buildInfo(page, buildId);
      expect(info.aiMockupId, "a failed generation stores nothing").toBeNull();
      expect(info.mockupRows).toBe(0);
      // recovery: the same page, Gemini healthy again, the retry button works
      await stub.mode("ok");
      const before = (await stub.stats()).calls;
      await page.getByRole("button", { name: /try again|retry/i }).first().click();
      await expect.poll(async () => (await stub.stats()).calls, { timeout: 60_000 }).toBeGreaterThan(before);
      await expect(page.getByTestId("preview-error")).toHaveCount(0, { timeout: 30_000 });
      await expect.poll(async () => (await buildInfo(page, buildId)).aiMockupId, { timeout: 30_000 }).not.toBeNull();
    });
  }

  test("a slow Gemini response shows progress and still succeeds", async ({ page }) => {
    await createUserAndLogin(page, uniqueEmail("gs"));
    await openDesigner(page);
    await uploadAndPlace(page);
    await stub.mode("slow");
    await page.getByRole("button", { name: /save t-shirt/i }).click();
    await expect(page.getByTestId("preview-status")).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await stub.stats()).calls, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId("preview-error")).toHaveCount(0, { timeout: 30_000 });
  });

  test("the persisted mockup is served to its owner and refused to everyone else", async ({ page, browser }) => {
    await createUserAndLogin(page, uniqueEmail("go"));
    await openDesigner(page);
    await uploadAndPlace(page);
    const buildId = buildIdFromUrl(page);
    await page.getByRole("button", { name: /save t-shirt/i }).click();
    await expect.poll(async () => (await buildInfo(page, buildId)).aiMockupId, { timeout: 60_000 }).not.toBeNull();
    const info = await buildInfo(page, buildId);
    const own = await page.request.get(`/api/mockups/${info.aiMockupId}/file`);
    expect(own.status()).toBe(200);
    expect(own.headers()["content-type"]).toMatch(/image\//);
    expect(own.headers()["content-security-policy"]).toMatch(/^sandbox;/);
    const otherCtx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const other = await otherCtx.newPage();
    await createUserAndLogin(other, uniqueEmail("gother"));
    expect((await other.request.get(`/api/mockups/${info.aiMockupId}/file`)).status()).toBe(403);
    expect((await other.request.get(`/api/assets/${info.assets[0].id}/file`)).status()).toBe(403);
    // another signed-in user cannot generate against my build / draft either, and cannot spend my build's artwork
    const body = { buildId, draftId: info.draftId, product: "FITTED", color: "WHITE", layers: [{ placement: "CENTER_FRONT", assetId: info.assets[0].id, x: 0, y: 0, scale: 1, rotation: 0 }] };
    const before = (await stub.stats()).calls;
    expect((await other.request.post("/api/mockups/nanobanana", { data: body })).status()).toBe(403);
    expect((await stub.stats()).calls, "a refused request never reaches Gemini").toBe(before);
    await otherCtx.close();
  });

  test("invalid requests are refused before Gemini is called", async ({ page }) => {
    await createUserAndLogin(page, uniqueEmail("gi"));
    await openDesigner(page);
    await uploadAndPlace(page);
    const buildId = buildIdFromUrl(page);
    const info = await buildInfo(page, buildId);
    const layer = { placement: "CENTER_FRONT", assetId: info.assets[0].id, x: 0, y: 0, scale: 1, rotation: 0 };
    const base = { buildId, draftId: info.draftId, product: "FITTED", color: "WHITE", layers: [layer] };
    const cases: Array<[string, unknown, number]> = [
      ["empty object", {}, 400], ["bad product", { ...base, product: "HOODIE" }, 400], ["bad colour", { ...base, color: "PINK" }, 400],
      ["no layers", { ...base, layers: [] }, 400], ["another draft id", { ...base, draftId: "not-my-draft" }, 404],
      ["an asset that is not on this build", { ...base, layers: [{ ...layer, assetId: "nope" }] }, 404],
      ["front + back in one request", { ...base, layers: [layer, { ...layer, placement: "FULL_BACK" }] }, 400],
    ];
    for (const [name, data, status] of cases) {
      const res = await page.request.post("/api/mockups/nanobanana", { data: data as object });
      expect(res.status(), name).toBe(status);
    }
    const malformed = await page.request.post("/api/mockups/nanobanana", { data: "{not json", headers: { "content-type": "application/json" } });
    expect(malformed.status()).toBe(400);
    expect((await stub.stats()).calls, "no invalid request reached Gemini").toBe(0);
  });

  test("concurrent generation requests: all are admitted or limited cleanly, each admitted one calls Gemini exactly once, nothing 500s", async ({ page }) => {
    await createUserAndLogin(page, uniqueEmail("gc"));
    await openDesigner(page);
    await uploadAndPlace(page);
    const buildId = buildIdFromUrl(page);
    const info = await buildInfo(page, buildId);
    const body = { buildId, draftId: info.draftId, product: "FITTED", color: "WHITE", layers: [{ placement: "CENTER_FRONT", assetId: info.assets[0].id, x: 0, y: 0, scale: 1, rotation: 0 }] };
    const results = await Promise.all(Array.from({ length: 24 }, () => page.request.post("/api/mockups/nanobanana", { data: body }).then((r) => r.status())));
    const ok = results.filter((s) => s === 200).length;
    const limited = results.filter((s) => s === 429).length;
    expect(results.every((s) => s === 200 || s === 429), `statuses: ${results.join(",")}`).toBeTruthy();
    expect(ok + limited).toBe(24);
    expect(ok, "the 20-per-10-minutes burst limit admits 20, however many arrive at once").toBe(20);
    expect(limited).toBe(4);
    expect((await stub.stats()).calls, "every admitted request called Gemini once, no limited one did").toBe(20);
  });
});
