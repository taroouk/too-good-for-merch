import { test, expect } from "../fixtures/guard";
import { buildIdFromUrl, buildInfo, createUserAndLogin, openDesigner, uniqueEmail, artworkPng } from "../fixtures/helpers";

// Regression test for the intermittent "uploadAndPlace" failure (artwork never reached the shirt: counter stayed 0/4 and the frame showed
// a broken "Artwork preview" image).
//
// Cause: an upload floats over the tee (staged) while it is saved. When the save finishes, the app swaps the staged copy for the saved one
// and revokes the local blob: URL. "Place it" pressed in that instant ran the handler of the PREVIOUS render, which still held the
// temporary copy: it put the already revoked blob: URL on the shirt and waited for a save that had already finished, so nothing was
// ever stored and the image was broken.
//
// The window is a few milliseconds, so the test makes it deterministic: the moment the app revokes the local blob (that call is made
// synchronously right after it queued the swap, before React renders it) the test presses "Place it" from inside that very call.
test("pressing Place it at the instant the upload finishes still places the saved artwork", async ({ page }) => {
  await createUserAndLogin(page, uniqueEmail("race"));
  await openDesigner(page);
  const buildId = buildIdFromUrl(page);
  await page.evaluate(() => {
    const original = URL.revokeObjectURL.bind(URL);
    (window as unknown as { __raceClicks: number }).__raceClicks = 0;
    URL.revokeObjectURL = (url: string) => {
      const place = Array.from(document.querySelectorAll("button")).find((b) => /place it/i.test(b.textContent ?? ""));
      if (place && (window as unknown as { __raceClicks: number }).__raceClicks === 0) {
        (window as unknown as { __raceClicks: number }).__raceClicks = 1;
        place.click(); // inside the upload's completion, before React has rendered the swapped copy
      }
      original(url);
    };
  });
  await page.locator('input[type="file"]').first().setInputFiles({ name: "art.png", mimeType: "image/png", buffer: await artworkPng() });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __raceClicks: number }).__raceClicks), { timeout: 20_000, message: "the race was actually exercised" }).toBe(1);
  await expect(page.getByText(/1 ?\/ ?4/), "the artwork is on the shirt").toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await buildInfo(page, buildId)).assets.length, { timeout: 15_000 }).toBe(1);
  const img = page.locator('img[alt="Artwork preview"]').first();
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { timeout: 10_000, message: "the image on the shirt is not broken" }).toBe(true);
});
