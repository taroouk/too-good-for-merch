import { test, expect } from "../fixtures/guard";

// Policy: Gemini is the ONLY mockup generator and needs a signed-in user. Enforced on the backend, not just in the UI.
test.describe("guest and Gemini", () => {
  test("a guest calling the Gemini API directly is refused with 401", async ({ request }) => {
    const res = await request.post("/api/mockups/nanobanana", { data: { buildId: "x", draftId: "y" } });
    expect(res.status()).toBe(401);
    expect((await res.json()).error).toMatch(/sign in/i);
  });

  test("the old Print Mockup route no longer exists", async ({ request }) => {
    expect((await request.post("/api/mockups/print", { data: {} })).status()).toBe(404);
  });

  test("a guest who tries to open the designer is asked to sign in", async ({ page }) => {
    await page.goto("/studio");
    await page.getByRole("button", { name: /build your t-shirt/i }).click();
    await expect(page.getByText(/log in or sign up/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /build your t-shirt/i })).toHaveCount(0);
  });
});
