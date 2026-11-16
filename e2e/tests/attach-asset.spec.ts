import { test, expect } from "../fixtures/guard";
import { buildIdFromUrl, buildInfo, createUserAndLogin, openDesigner, uniqueEmail, uploadAndPlace } from "../fixtures/helpers";

// Picking an earlier upload from "Your uploads" while working in a NEW project copies it into that project (actionAttachExistingAsset).
// - Selecting it again, or a replayed call, must not copy the (up to 10 MB) image again and again.
// - If the image is gone, the customer is told and the shirt keeps what it had (it used to show the image silently, unattached).
test.describe("attaching an earlier upload to a new project", () => {
  let first: string;
  let second: string;
  let sourceId: string;
  test.beforeEach(async ({ page }) => {
    await createUserAndLogin(page, uniqueEmail("attach"));
    await openDesigner(page);
    first = buildIdFromUrl(page);
    await uploadAndPlace(page);
    await expect.poll(async () => (await buildInfo(page, first)).assets.length).toBe(1);
    sourceId = (await buildInfo(page, first)).assets[0].id;
    // A second project of the same customer; the earlier upload is offered in its "Your uploads".
    await page.goto("/studio/projects/new");
    await expect(async () => {
      if (!/\/studio\/projects\/(?!new)[^/]+/.test(page.url())) await page.getByRole("button", { name: "Create" }).click({ timeout: 3000 });
      await expect(page).toHaveURL(/\/studio\/projects\/(?!new)[^/]+/, { timeout: 6000 });
    }).toPass({ timeout: 40_000 });
    const created = buildIdFromUrl(page);
    await openDesigner(page); // the Studio opens the customer's latest project: the new one
    second = buildIdFromUrl(page);
    expect(second, "the designer is open on the new project").toBe(created);
    expect(second).not.toBe(first);
  });

  test("copies the image once; selecting it again or replaying the call adds no further copy", async ({ page }) => {
    let recorded: { url: string; headers: Record<string, string>; body: Buffer } | null = null;
    await page.route(/\/studio\//, async (route) => {
      const r = route.request();
      if (r.method() === "POST" && r.headers()["next-action"] && r.postData()?.includes(sourceId) && !recorded) recorded = { url: r.url(), headers: r.headers(), body: r.postDataBuffer()! };
      return route.continue();
    });
    // Clicking a tile floats it over the tee; "Place it" is what puts it in this project (and attaches it).
    const tile = page.locator("button.studio-upload-slot").first();
    const place = page.getByRole("button", { name: /place it/i });
    await expect(async () => {
      if (!(await place.isVisible().catch(() => false))) await tile.click({ timeout: 3000 });
      await place.click({ timeout: 3000 });
      await expect.poll(() => recorded !== null, { timeout: 4000 }).toBe(true);
    }).toPass({ timeout: 40_000 });
    await expect.poll(async () => (await buildInfo(page, second)).assets.length, { timeout: 20_000 }).toBe(1);

    const replay = () => {
      const { host, cookie, "content-length": _cl, ...headers } = recorded!.headers; void host; void cookie; void _cl;
      return page.request.fetch(recorded!.url, { method: "POST", headers, data: recorded!.body });
    };
    for (let i = 0; i < 3; i++) expect((await replay()).status()).toBeLessThan(500);
    expect((await buildInfo(page, second)).assets.length, "still exactly one copy in the new project").toBe(1);
    expect((await buildInfo(page, first)).assets.length, "the original is untouched").toBe(1);
  });

  test("an upload that no longer exists: the customer is told, nothing is attached, the shirt keeps what it had", async ({ page }) => {
    await page.route(/\/studio\//, async (route) => {
      const r = route.request();
      const data = r.postDataBuffer();
      if (r.method() === "POST" && r.headers()["next-action"] && data?.toString("latin1").includes(sourceId)) {
        return route.continue({ postData: Buffer.from(data.toString("latin1").replace(sourceId, "0".repeat(sourceId.length)), "latin1") });
      }
      return route.continue();
    });
    const tile = page.locator("button.studio-upload-slot").first();
    const place = page.getByRole("button", { name: /place it/i });
    const message = page.getByText(/no longer available/i).first();
    await expect(async () => {
      if (!(await message.isVisible().catch(() => false))) {
        if (!(await place.isVisible().catch(() => false))) await tile.click({ timeout: 3000 });
        await place.click({ timeout: 3000 });
      }
      await expect(message).toBeVisible({ timeout: 4000 });
    }).toPass({ timeout: 40_000 });
    expect((await buildInfo(page, second)).assets.length, "nothing was attached").toBe(0);
    await expect(page.getByText(/0 ?\/ ?4/), "nothing is shown as placed").toBeVisible();
  });
});
