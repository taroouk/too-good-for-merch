import { test, expect } from "../fixtures/guard";

// The browser guard itself: a page (or a popup it opens) that tries to reach a non-local host gets nothing, whatever the way it asks.
// (Requests made through Playwright's APIRequestContext are not browser traffic; those tests only ever target the local server.)
const HOSTS = ["example.com", "generativelanguage.googleapis.com", "accept.paymob.com", "wa.me"];

test("every attempt to reach an external host from the page or from a popup is aborted", async ({ page, context }) => {
  for (const h of HOSTS) test.info().annotations.push({ type: "allowed-external", description: h }); // this test provokes them on purpose
  await page.goto("/login");

  const results = await page.evaluate(async (hosts) => {
    const out: Record<string, string> = {};
    for (const h of hosts) {
      out[`fetch ${h}`] = await fetch(`https://${h}/x`, { mode: "no-cors" }).then(() => "reached", () => "blocked");
      out[`image ${h}`] = await new Promise<string>((resolve) => { const i = new Image(); i.onload = () => resolve("reached"); i.onerror = () => resolve("blocked"); i.src = `https://${h}/p.png?${Math.random()}`; });
      out[`xhr ${h}`] = await new Promise<string>((resolve) => { const x = new XMLHttpRequest(); x.onload = () => resolve("reached"); x.onerror = () => resolve("blocked"); x.open("GET", `https://${h}/y`); x.send(); });
      out[`beacon ${h}`] = String(navigator.sendBeacon(`https://${h}/b`, "x")); // true only means "queued"; the abort is asserted through the guard below
    }
    return out;
  }, HOSTS);
  for (const [k, v] of Object.entries(results)) if (!k.startsWith("beacon")) expect(v, k).toBe("blocked");

  // A popup (window.open) and a top-level navigation: the new tab is covered because the guard is routed on the context.
  for (const h of HOSTS) {
    const [popup] = await Promise.all([context.waitForEvent("page"), page.evaluate((host) => { window.open(`https://${host}/`, "_blank"); }, h)]);
    await popup.waitForLoadState("domcontentloaded").catch(() => undefined);
    expect(new URL(popup.url()).hostname === h ? await popup.title().catch(() => "") : "", `popup to ${h} must not render the real site`).not.toMatch(/Example Domain|Google|Paymob|WhatsApp/i);
    await popup.close();
  }
  const nav = await page.goto("https://example.com/").catch(() => null);
  expect(nav, "a top-level navigation to an external host is aborted").toBeNull();
});
