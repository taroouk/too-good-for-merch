import { test, expect } from "../fixtures/guard";
import type { APIRequestContext, Browser } from "@playwright/test";
import { adminLoginApi, buildIdFromUrl, createUserAndLogin, loginApi, openDesigner, PASSWORD, uniqueEmail } from "../fixtures/helpers";

// Three admin Server Actions that no page form calls yet (setCustomQuoteAction, clearCustomQuoteAction, updateDisplayCurrencyAction) are still
// public endpoints: a request that carries their id runs them. They are exercised here the way such a request would: as the admin (works and
// stores the right data), as a guest, an ordinary customer, a blocked customer and a demoted admin (refused, nothing changes), and with bad
// input (refused with the message, nothing partially written). The ids come from the build's own manifest (QA route, test server only).
const ADMIN_EMAIL = "qa-admin@tgfm.test";

async function actor(browser: Browser, kind: "guest" | "user" | "blocked" | "demoted"): Promise<APIRequestContext> {
  const ctx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
  const page = await ctx.newPage();
  if (kind === "guest") return ctx.request;
  const email = uniqueEmail(kind);
  if (kind === "demoted") {
    expect((await page.request.post("/api/qa-sim/make-admin", { data: { email, password: PASSWORD } })).ok()).toBeTruthy();
    await loginApi(page, email, PASSWORD);
    await page.request.post("/api/qa-sim/set-user-state", { data: { email, role: "USER" } }); // the session token still says ADMIN
  } else {
    await createUserAndLogin(page, email);
    if (kind === "blocked") await page.request.post("/api/qa-sim/set-user-state", { data: { email, blocked: true } });
  }
  return ctx.request;
}

// A Server Action called by hand: multipart body in the exact shape the browser sends (the action's FormData argument is "$K1", its
// fields are prefixed "_1_"); the answer is 200 with the redirect in x-action-redirect (the proxy answers guests with a plain Location).
async function callAction(req: APIRequestContext, ids: Record<string, string>, name: string, fields: Record<string, string>, path: string) {
  expect(ids[name], `${name} is registered in this build`).toBeTruthy();
  const boundary = `----tgfm${Math.random().toString(16).slice(2)}`;
  const part = (n: string, v: string) => `--${boundary}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`;
  const body = Object.entries(fields).map(([k, v]) => part(`_1_${k}`, v)).join("") + part("0", '["$K1"]') + `--${boundary}--\r\n`;
  const res = await req.post(path, {
    headers: { "next-action": ids[name], accept: "text/x-component", "content-type": `multipart/form-data; boundary=${boundary}` },
    data: Buffer.from(body, "utf8"),
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  const redirect = res.headers()["x-action-redirect"] ?? res.headers()["location"] ?? "";
  const param = (key: string) => (redirect.includes(`${key}=`) ? decodeURIComponent(redirect.split(`${key}=`)[1].split(/[&;]/)[0].replace(/\+/g, " ")) : null);
  return { status: res.status(), redirect, notice: param("notice"), error: param("error") };
}

test.describe("admin actions that no page calls yet", () => {
  let ids: Record<string, string>;
  let buildId: string;
  let otherBuildId: string;
  const draft = async (req: APIRequestContext, id = buildId, setProduct?: string) => (await (await req.post("/api/qa-sim/draft-state", { data: { buildId: id, setProduct } })).json()) as {
    draft: { product: string; customQuoteUsdCents: number | null; customQuoteNote: string | null; customQuotedAt: string | null; customQuotedByEmail: string | null };
    audits: number;
  };
  const store = async (req: APIRequestContext, body: object = {}) => (await (await req.post("/api/qa-sim/store-state", { data: body })).json()) as { setting: { displayCurrency: string; usdToEgpRate: number | null } | null; audits: number };

  test.beforeEach(async ({ page }) => {
    ids = (await (await page.request.get("/api/qa-sim/action-ids")).json()).ids;
    // a customer with two projects: one Bespoke (CUSTOM) and one ordinary
    await createUserAndLogin(page, uniqueEmail("quote"));
    await openDesigner(page);
    buildId = buildIdFromUrl(page);
    await draft(page.request, buildId, "CUSTOM");
    await page.goto("/studio/projects/new");
    await expect(async () => {
      if (!/\/studio\/projects\/(?!new)[^/]+/.test(page.url())) await page.getByRole("button", { name: "Create" }).click({ timeout: 3000 });
      await expect(page).toHaveURL(/\/studio\/projects\/(?!new)[^/]+/, { timeout: 6000 });
    }).toPass({ timeout: 40_000 });
    otherBuildId = buildIdFromUrl(page);
    expect(otherBuildId).not.toBe(buildId);
    expect((await draft(page.request, otherBuildId)).draft.product, "the second project is not Bespoke").not.toBe("CUSTOM");
  });

  test("custom quote: the admin sets, replaces and clears it; every refusal leaves the draft exactly as it was", async ({ page, browser }) => {
    const nobody = await actor(browser, "guest");
    const admin = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const adminPage = await admin.newPage();
    await adminLoginApi(adminPage);
    const a = adminPage.request;
    const call = (name: string, fields: Record<string, string>) => callAction(a, ids, name, fields, "/admin/bespoke");
    const initial = await draft(page.request);
    expect(initial.draft.customQuoteUsdCents).toBeNull();

    // refused while nothing is stored: every kind of bad input
    for (const [label, fields, message] of [
      ["zero", { buildId, amountUsd: "0" }, /valid quote amount/i],
      ["negative", { buildId, amountUsd: "-5" }, /valid quote amount/i],
      ["text", { buildId, amountUsd: "abc" }, /valid quote amount/i],
      ["empty", { buildId, amountUsd: "" }, /valid quote amount/i],
      ["huge", { buildId, amountUsd: "1000001" }, /too large/i],
      ["no build", { amountUsd: "10" }, /build is required/i],
      ["unknown build", { buildId: "does-not-exist", amountUsd: "10" }, /not found/i],
      ["not a Bespoke build", { buildId: otherBuildId, amountUsd: "10" }, /not a bespoke/i],
    ] as const) {
      const r = await call("setCustomQuoteAction", { ...fields });
      expect(r.error, `${label}: refused with its message`).toMatch(message);
      expect(r.notice, label).toBeNull();
    }
    expect(await draft(page.request), "bad input changed nothing (no quote, no audit)").toEqual(initial);
    expect((await draft(page.request, otherBuildId)).draft.customQuoteUsdCents, "the other build was not quoted").toBeNull();

    // success: exact data
    const set = await call("setCustomQuoteAction", { buildId, amountUsd: "123.45", note: "Hand embroidery, 2 weeks" });
    expect(set.notice).toBe("Quote saved.");
    let state = await draft(page.request);
    expect(state.draft.customQuoteUsdCents).toBe(12345);
    expect(state.draft.customQuoteNote).toBe("Hand embroidery, 2 weeks");
    expect(state.draft.customQuotedByEmail).toBe(ADMIN_EMAIL);
    expect(Date.now() - new Date(state.draft.customQuotedAt!).getTime(), "stamped just now").toBeLessThan(60_000);
    expect(state.audits).toBe(initial.audits + 1);

    // replaced, not added
    expect((await call("setCustomQuoteAction", { buildId, amountUsd: "200" })).notice).toBe("Quote saved.");
    state = await draft(page.request);
    expect(state.draft.customQuoteUsdCents).toBe(20000);
    expect(state.draft.customQuoteNote, "a new quote without a note drops the old note").toBeNull();
    expect(state.audits).toBe(initial.audits + 2);

    // a later bad request does not disturb the stored quote
    const before = await draft(page.request);
    expect((await call("setCustomQuoteAction", { buildId, amountUsd: "oops", note: "should not be stored" })).error).toMatch(/valid quote amount/i);
    expect(await draft(page.request), "failure after a stored quote: nothing partially written").toEqual(before);

    // everyone who is not the admin: refused, nothing changes (set AND clear)
    for (const kind of ["guest", "user", "blocked", "demoted"] as const) {
      const who = kind === "guest" ? nobody : await actor(browser, kind);
      for (const [name, fields] of [["setCustomQuoteAction", { buildId, amountUsd: "999", note: `by ${kind}` }], ["clearCustomQuoteAction", { buildId }]] as const) {
        const r = await callAction(who, ids, name, { ...fields }, "/admin/bespoke");
        expect(r.redirect, `${kind} ${name}: sent to the admin login`).toMatch(/\/admin\/login/);
        expect(r.notice, `${kind} ${name}: no success message`).toBeNull();
      }
      expect(await draft(page.request), `${kind} changed nothing`).toEqual(before);
    }

    // clear: refusals first, then the real thing
    expect((await call("clearCustomQuoteAction", {})).error).toMatch(/build is required/i);
    expect((await call("clearCustomQuoteAction", { buildId: "does-not-exist" })).error).toMatch(/not found/i);
    expect(await draft(page.request), "failed clears changed nothing").toEqual(before);
    expect((await call("clearCustomQuoteAction", { buildId })).notice).toBe("Quote cleared.");
    state = await draft(page.request);
    expect(state.draft).toMatchObject({ customQuoteUsdCents: null, customQuoteNote: null, customQuotedAt: null, customQuotedByEmail: null });
    expect(state.audits).toBe(before.audits + 1);
    await admin.close();
  });

  test("display currency: the admin switches it (rate required for EGP); every refusal leaves the setting as it was", async ({ page, browser }) => {
    const admin = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const adminPage = await admin.newPage();
    await adminLoginApi(adminPage);
    const a = adminPage.request;
    const call = (fields: Record<string, string>) => callAction(a, ids, "updateDisplayCurrencyAction", fields, "/admin/settings");
    const original = await store(page.request);
    try {
      await store(page.request, { displayCurrency: "USD", usdToEgpRate: null });
      const base = await store(page.request);
      expect(base.setting).toMatchObject({ displayCurrency: "USD", usdToEgpRate: null });

      // EGP without a rate is refused and nothing is written
      expect((await call({ displayCurrency: "EGP" })).error).toMatch(/exchange rate first/i);
      for (const bad of ["XXX", "", "EURO", "<script>"]) expect((await call({ displayCurrency: bad })).error, `"${bad}"`).toMatch(/supported currency/i);
      expect(await store(page.request), "refusals changed nothing").toEqual(base);

      // with a rate it works, is stored exactly, and is audited once
      await store(page.request, { usdToEgpRate: 48.5 });
      const withRate = await store(page.request);
      const set = await call({ displayCurrency: "egp" }); // case-insensitive
      expect(set.notice).toBe("Customers now see prices in EGP.");
      let now = await store(page.request);
      expect(now.setting).toEqual({ displayCurrency: "EGP", usdToEgpRate: 48.5 });
      expect(now.audits).toBe(withRate.audits + 1);

      // the same value again: told so, no second audit row
      expect((await call({ displayCurrency: "EGP" })).notice).toMatch(/already see prices in EGP/i);
      expect((await store(page.request)).audits).toBe(now.audits);

      // a hostile returnTo cannot send the admin away from /admin
      const sneaky = await call({ displayCurrency: "USD", returnTo: "https://evil.example.com/x" });
      expect(sneaky.redirect.startsWith("/admin/"), `stays inside the admin: ${sneaky.redirect}`).toBe(true);
      now = await store(page.request);
      expect(now.setting?.displayCurrency).toBe("USD");

      // everyone who is not the admin: refused, nothing changes
      await store(page.request, { displayCurrency: "EGP" });
      const before = await store(page.request);
      for (const kind of ["guest", "user", "blocked", "demoted"] as const) {
        const who = await actor(browser, kind);
        const r = await callAction(who, ids, "updateDisplayCurrencyAction", { displayCurrency: "USD" }, "/admin/settings");
        expect(r.redirect, `${kind}: sent to the admin login`).toMatch(/\/admin\/login/);
        expect(r.notice, kind).toBeNull();
        expect(await store(page.request), `${kind} changed nothing`).toEqual(before);
      }
    } finally {
      await store(page.request, { displayCurrency: original.setting?.displayCurrency ?? "USD", usdToEgpRate: original.setting?.usdToEgpRate ?? null });
      await admin.close();
    }
  });
});
