import { test, expect } from "../fixtures/guard";
import type { Page } from "@playwright/test";
import { buildIdFromUrl, buildInfo, createUserAndLogin, openDesigner, uniqueEmail, uploadAndPlace } from "../fixtures/helpers";

// Crop: a valid crop through the real UI is stored as a linked copy of the original; invalid or forged crop data (the browser's request
// is rewritten on the wire) is refused with the SPECIFIC message and leaves no asset row behind. Run against a production build too, where
// Next hides the text of an error thrown by a server action: these messages must therefore be returned, not thrown.
async function openCropper(page: Page) {
  const crop = page.getByRole("button", { name: "Crop artwork" });
  await expect(async () => {
    if (await crop.isVisible().catch(() => false)) await crop.click({ timeout: 3000 });
    await expect(page.getByRole("button", { name: "Done" })).toBeVisible({ timeout: 4000 });
  }).toPass({ timeout: 40_000 });
}
async function rotateTo(page: Page, degrees: number) {
  await page.locator("#crop-rotate").evaluate((el: HTMLInputElement, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, degrees);
}

test.describe("artwork crop", () => {
  let buildId: string;
  test.beforeEach(async ({ page }) => {
    await createUserAndLogin(page, uniqueEmail("crop"));
    await openDesigner(page);
    buildId = buildIdFromUrl(page);
    await uploadAndPlace(page);
    await expect.poll(async () => (await buildInfo(page, buildId)).assets.length).toBe(1);
  });

  test("a valid crop is stored as a copy linked to its original, with the crop it came from", async ({ page }) => {
    const [original] = (await buildInfo(page, buildId)).assets;
    await openCropper(page);
    await rotateTo(page, 12);
    await page.getByRole("button", { name: "Done" }).click();
    await expect.poll(async () => (await buildInfo(page, buildId)).assets.length, { timeout: 20_000 }).toBe(2);
    const copy = (await buildInfo(page, buildId)).assets.find((a) => a.id !== original.id)!;
    expect(copy.cropSourceAssetId, "linked to the untouched original").toBe(original.id);
    expect((copy.cropMeta as { rotation: number }).rotation).toBeCloseTo(12, 1);
    expect(copy.status).toBe("READY");
    expect(copy.mimeType).toBe("image/png");
    await expect(page.getByRole("button", { name: "Done" })).toHaveCount(0); // back out of crop mode
  });

  test("Cancel leaves everything as it was", async ({ page }) => {
    await openCropper(page);
    await rotateTo(page, 30);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "Done" })).toHaveCount(0);
    expect((await buildInfo(page, buildId)).assets.length).toBe(1);
  });

  // Rewrites the one request the browser sends when "Done" is pressed. `mutate` gets the multipart body as latin1 text (byte-exact).
  const forged: Array<[string, (body: string) => string, RegExp]> = [
    ["crop data that is not JSON", (b) => b.replace(/\{"rotation":[^}]*\}\}/, "this is not json"), /invalid crop data/i],
    ["crop data with an empty object", (b) => b.replace(/\{"rotation":[^}]*\}\}/, "{}"), /invalid crop data/i],
    ["a rotation outside -180..180", (b) => b.replace(/\{"rotation":[^,]*,/, '{"rotation":9999,'), /invalid crop data/i],
    ["a crop window that sticks out of the picture", (b) => b.replace(/"window":\{[^}]*\}/, '"window":{"x":0.9,"y":0.9,"w":0.9,"h":0.9}'), /invalid crop data/i],
    ["a crop window of zero size", (b) => b.replace(/"window":\{[^}]*\}/, '"window":{"x":0,"y":0,"w":0,"h":0}'), /invalid crop data/i],
    ["a source artwork id that does not exist", (b) => b.replace(/(name="[^"]*cropSourceAssetId"\r\n\r\n)[^\r]*/, "$1no-such-asset-id"), /original artwork for this crop was not found/i],
    ["a source artwork id that belongs to somebody else's build", (b) => b.replace(/(name="[^"]*cropSourceAssetId"\r\n\r\n)[^\r]*/, "$1cm0000000000000000000000"), /original artwork for this crop was not found/i],
  ];
  for (const [name, mutate, message] of forged) {
    test(`refuses ${name}: the specific message is shown and nothing is stored`, async ({ page }) => {
      let rewritten = 0;
      await page.route(/\/studio\//, async (route) => {
        const r = route.request();
        const data = r.postDataBuffer();
        if (r.method() !== "POST" || !data || !data.toString("latin1").includes("cropSourceAssetId")) return route.continue();
        const before = data.toString("latin1");
        const after = mutate(before);
        if (after !== before) rewritten++;
        return route.continue({ postData: Buffer.from(after, "latin1") });
      });
      await openCropper(page);
      await rotateTo(page, 12);
      await page.getByRole("button", { name: "Done" }).click();
      await expect(page.getByText(message).first(), "the customer sees the specific reason").toBeVisible({ timeout: 20_000 });
      expect(rewritten, "the request really was rewritten").toBeGreaterThan(0);
      expect((await buildInfo(page, buildId)).assets.length, "no asset row for a refused crop").toBe(1);
    });
  }
});
