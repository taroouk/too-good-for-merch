import fs from "node:fs";
import path from "node:path";
import { test, expect } from "../fixtures/guard";

// The QA-only routes (/api/qa-sim/*: make users and admins, mark orders paid, read the database...) must never exist where real
// customers are. This spec runs against a PRODUCTION build that is started in one of two ways (set E2E_QA_EXPOSURE):
//   absent    started WITHOUT --qa-routes: the routes are not in the build at all
//   disarmed  started with the routes installed but TGFM_FAKE_QA unset (--qa-routes-disarmed): each route's own guard must answer 404
// With neither set (the normal armed test server) only the source-tree checks run.
const mode = process.env.E2E_QA_EXPOSURE;
const repo = path.resolve(__dirname, "../..");
const overlay = path.join(repo, "scripts/isolation/qa/overlay/app/api/qa-sim");
const names = fs.readdirSync(overlay);
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

test.describe("QA routes are not exposed", () => {
  test("the real source tree contains no QA route and nothing reads the QA switch", async () => {
    expect(fs.existsSync(path.join(repo, "app/api/qa-sim")), "app/api/qa-sim must not exist in the repository").toBe(false);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && /qa-sim|TGFM_FAKE_QA/.test(fs.readFileSync(full, "utf8"))) offenders.push(path.relative(repo, full));
      }
    };
    walk(path.join(repo, "app"));
    walk(path.join(repo, "src"));
    expect(offenders, "no application file may mention the QA routes or their switch").toEqual([]);
  });

  test("every QA route answers 404 to every method, with an empty or generic body, and leaks nothing", async ({ request }) => {
    test.skip(mode !== "absent" && mode !== "disarmed", "needs the production build started WITHOUT the QA switch (E2E_QA_EXPOSURE=absent|disarmed)");
    expect(names.length).toBeGreaterThan(10);
    const bad: string[] = [];
    for (const name of names) {
      for (const method of METHODS) {
        const res = await request.fetch(`/api/qa-sim/${name}`, {
          method,
          data: method === "GET" || method === "HEAD" || method === "OPTIONS" ? undefined : { email: "probe@tgfm.test", password: "x", orderId: "x", buildId: "x" },
          failOnStatusCode: false,
          maxRedirects: 0,
        });
        const body = method === "HEAD" ? "" : await res.text();
        // A method the route really exports must answer exactly 404 (its own guard, or no route at all). A method it does not export is
        // answered by Next itself (405, or 204 to OPTIONS) with no body: not data, and not the route's code running. When the routes are
        // absent from the build everything is 404.
        const exported = new RegExp(`export\\s+async\\s+function\\s+${method}\\b`).test(fs.readFileSync(path.join(overlay, name, "route.ts"), "utf8"));
        const allowed = mode === "absent" || exported ? [404] : method === "OPTIONS" ? [404, 405, 204] : [404, 405];
        if (!allowed.includes(res.status())) bad.push(`${method} ${name} -> ${res.status()} (allowed ${allowed.join("/")})`);
        if (!exported && mode === "disarmed" && body.length > 0 && res.status() !== 404) bad.push(`${method} ${name} unexpected body on ${res.status()}`);
        if (/"ok"\s*:\s*true|"id"\s*:|password|session|@tgfm\.test/i.test(body)) bad.push(`${method} ${name} body leaks: ${body.slice(0, 80)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  test("guessable neighbours of the QA routes do not exist either", async ({ request }) => {
    test.skip(mode !== "absent" && mode !== "disarmed", "needs the production build started WITHOUT the QA switch");
    const probes = ["/api/qa-sim", "/api/qa-sim/", "/api/qa", "/api/qa/make-user", "/api/test", "/api/__qa", "/api/qa-sim/../health/../qa-sim/make-user", "/api/qa-sim/make-user/", "/qa-sim", "/api/qa-sim/%2e%2e/make-admin"];
    for (const probe of probes) {
      const res = await request.get(probe, { failOnStatusCode: false, maxRedirects: 0 });
      // 405 = the route exists but not for this method (switch off, routes installed); never a 2xx
      expect(mode === "absent" ? [404, 308, 307] : [404, 405, 308, 307], `${probe} -> ${res.status()}`).toContain(res.status());
      expect(await res.text(), probe).not.toMatch(/"ok"\s*:\s*true/);
    }
  });

  test("an account cannot be created through a QA route, and the real sign-up is still the only way in", async ({ request }) => {
    test.skip(mode !== "absent" && mode !== "disarmed", "needs the production build started WITHOUT the QA switch");
    const email = `probe-${Date.now()}@tgfm.test`;
    await request.post("/api/qa-sim/make-user", { data: { email, password: "probe-password-1" }, failOnStatusCode: false });
    await request.post("/api/qa-sim/make-admin", { data: { email, password: "probe-password-1" }, failOnStatusCode: false });
    const csrf = await (await request.get("/api/auth/csrf")).json();
    await request.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, email, password: "probe-password-1", json: "true" }, failOnStatusCode: false });
    const session = await (await request.get("/api/auth/session")).json();
    expect(session?.user, "no session: the account was not created").toBeFalsy();
  });
});
