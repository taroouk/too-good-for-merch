import { test, expect } from "../fixtures/guard";
import { artworkPng, buildIdFromUrl, buildInfo, createUserAndLogin, openDesigner, uniqueEmail } from "../fixtures/helpers";

// The upload rate limit (30 per 10 minutes per user) must reach the customer as a readable message in a PRODUCTION build too: the action
// RETURNS it instead of throwing it (Next replaces the message of a thrown server-action error with a generic one in production).
test("the 31st upload within the window is refused with a readable message and stores nothing", async ({ page }) => {
  test.setTimeout(240_000);
  await createUserAndLogin(page, uniqueEmail("limit"));
  await openDesigner(page);
  const buildId = buildIdFromUrl(page);
  const input = page.locator('input[type="file"]').first();
  const png = await artworkPng(64, 64);
  for (let i = 0; i < 30; i++) {
    // distinct bytes each time (a trailing comment-like pad) so no upload is a duplicate of the previous one
    await input.setInputFiles({ name: `a${i}.png`, mimeType: "image/png", buffer: Buffer.concat([png, Buffer.from([i])]) });
    await expect.poll(async () => (await buildInfo(page, buildId)).assets.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  }
  await expect.poll(async () => (await buildInfo(page, buildId)).assets.length, { timeout: 20_000 }).toBe(30);
  const stored = 30;
  await input.setInputFiles({ name: "one-too-many.png", mimeType: "image/png", buffer: Buffer.concat([png, Buffer.from([99])]) });
  await expect(page.getByText(/too many uploads/i).first()).toBeVisible({ timeout: 20_000 });
  expect((await buildInfo(page, buildId)).assets.length, "the refused upload stored nothing").toBe(stored);
});
