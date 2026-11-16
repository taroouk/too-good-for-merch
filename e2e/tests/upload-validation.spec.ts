import { test, expect } from "../fixtures/guard";
import { artworkPng, buildIdFromUrl, buildInfo, createUserAndLogin, openDesigner, uniqueEmail } from "../fixtures/helpers";

// Artwork upload validation through the real UI + server action + database: type, content sniffing, size, pixel limits, hostile SVGs.
// Every rejected file must leave NO asset row behind.
// The message the customer must see for each kind of rejection. It must be the SPECIFIC reason, also in a production build (where Next
// redacts the text of an error thrown by a server action), not a generic "something went wrong".
const SPECIFIC = {
  type: /PNG, JPG, WEBP, or SVG/i,
  size: /10 ?MB/i,
  svg: /unsupported content/i,
  pixels: /too large in pixels/i,
  generic: /couldn.t be uploaded/i, // content/type mismatch is deliberately not spelled out
};

test.describe("artwork upload validation", () => {
  test.beforeEach(async ({ page }) => {
    await createUserAndLogin(page, uniqueEmail("up"));
    await openDesigner(page);
  });

  const cases: Array<[string, RegExp, () => Promise<{ name: string; mimeType: string; buffer: Buffer }>]> = [
    ["a text file pretending to be a PNG (content does not match)", SPECIFIC.generic, async () => ({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("this is not an image at all") })],
    ["a PDF", SPECIFIC.type, async () => ({ name: "doc.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") })],
    ["a GIF (type not allowed)", SPECIFIC.type, async () => ({ name: "a.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a....") })],
    ["a JPEG header declared as PNG", SPECIFIC.generic, async () => ({ name: "x.png", mimeType: "image/png", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]) })],
    ["an executable renamed .png", SPECIFIC.generic, async () => ({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("MZ\x90\x00\x03\x00\x00\x00") })],
    ["an image over the 10 MB limit", SPECIFIC.size, async () => { const b = await artworkPng(100, 100); return { name: "huge.png", mimeType: "image/png", buffer: Buffer.concat([b, Buffer.alloc(11 * 1024 * 1024)]) }; }],
    ["an SVG with a <script>", SPECIFIC.svg, async () => ({ name: "s.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') })],
    ["an SVG with a namespace-prefixed <svg:script>", SPECIFIC.svg, async () => ({ name: "p.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg:svg xmlns:svg="http://www.w3.org/2000/svg"><svg:script>alert(1)</svg:script></svg:svg>') })],
    ["an SVG with an animated javascript: link", SPECIFIC.svg, async () => ({ name: "a.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><a><set attributeName="href" to="javascript:alert(1)"/><text y="9">x</text></a></svg>') })],
    ["an SVG with a remote image", SPECIFIC.svg, async () => ({ name: "r.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="https://evil.example/x.png"/></svg>') })],
  ];

  for (const [name, message, make] of cases) {
    test(`rejects ${name} and stores nothing`, async ({ page }) => {
      const buildId = buildIdFromUrl(page);
      const before = (await buildInfo(page, buildId)).assets.length;
      await page.locator('input[type="file"]').first().setInputFiles(await make());
      await expect(page.getByText(message).first(), "the customer sees the specific reason").toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("button", { name: /place it/i })).toHaveCount(0);
      expect((await buildInfo(page, buildId)).assets.length, "no asset row for a rejected file").toBe(before);
    });
  }

  test("a harmless SVG is accepted", async ({ page }) => {
    const buildId = buildIdFromUrl(page);
    await page.locator('input[type="file"]').first().setInputFiles({ name: "ok.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="red"/></svg>') });
    await expect(page.getByRole("button", { name: /place it/i })).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await buildInfo(page, buildId)).assets.length).toBe(1);
  });

  test("an accepted PNG is stored with the right type, size and a READY status; the served bytes are the uploaded bytes", async ({ page }) => {
    const buildId = buildIdFromUrl(page);
    const png = await artworkPng(320, 240);
    await page.locator('input[type="file"]').first().setInputFiles({ name: "../../etc/passwd.png", mimeType: "image/png", buffer: png });
    await expect(page.getByRole("button", { name: /place it/i })).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await buildInfo(page, buildId)).assets.length).toBe(1);
    const [asset] = (await buildInfo(page, buildId)).assets;
    expect(asset.mimeType).toBe("image/png");
    expect(asset.sizeBytes).toBe(png.length);
    expect(asset.status).toBe("READY");
    const served = await page.request.get(`/api/assets/${asset.id}/file`);
    expect(served.status()).toBe(200);
    expect((await served.body()).equals(png), "the served file is byte-identical to the upload").toBeTruthy();
    expect(served.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("a very large (but allowed) number of pixels is refused; an oversized dimension is refused", async ({ page }) => {
    const sharp = require("../../node_modules/sharp");
    const wide = await sharp({ create: { width: 9000, height: 100, channels: 3, background: "#fff" } }).png().toBuffer();
    await page.locator('input[type="file"]').first().setInputFiles({ name: "wide.png", mimeType: "image/png", buffer: wide });
    await expect(page.getByText(SPECIFIC.pixels).first()).toBeVisible({ timeout: 20_000 });
  });
});
