// Unit tests for the Fake Prisma engine. No Next.js, no network, no Prisma runtime.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDb, createFakePrismaClient, FakePrismaError, RATE_LIMIT_CLEANUP_SQL, RATE_LIMIT_UPSERT_SQL, SUPPORTED_MODELS, LOCK_SQL } from "../fake-prisma/engine.mjs";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fake-prisma");
const REPO = path.resolve(DIR, "../../..");
const fresh = () => { const db = createDb(); return { db, p: createFakePrismaClient(db) }; };
const rejectsCode = (promise, code, msg) => assert.rejects(promise, (e) => e instanceof FakePrismaError && e.code === code, msg);
const loud = async (fn, code = "FAKE_UNSUPPORTED") => {
  try { await fn(); } catch (e) { assert.ok(e instanceof FakePrismaError && e.code === code, `expected ${code}, got ${e?.code ?? e}`); return; }
  assert.fail("expected the call to fail loudly");
};
const DbNull = new (class DbNull {})(); // same class name as Prisma.DbNull; matched by name, never imported

async function base(p) {
  await p.user.create({ data: { id: "u1", email: "a@x.test", role: "USER" } });
  await p.user.create({ data: { id: "u2", email: "b@x.test" } });
  await p.build.create({ data: { id: "b1", userId: "u1", name: "One", draft: { create: { product: "FITTED", color: "BLACK", quantity: 3 } } } });
  await p.build.create({ data: { id: "b2", userId: null, name: "Guest", draft: { create: {} } } });
  await p.asset.create({ data: { id: "a1", buildId: "b1", fileName: "one.png", url: "/x", artworkData: Buffer.from([1, 2, 3]) } });
  await p.asset.create({ data: { id: "a2", buildId: "b1", fileName: "two.png", hiddenAt: new Date() } });
  await p.asset.create({ data: { id: "a3", buildId: "b2", fileName: "three.png", url: "/z" } });
}

describe("CRUD per model", () => {
  // accessor: [create data, primary key field, field to change, new value]
  const samples = {
    user: [{ id: "u", email: "u@x.test" }, "id", "phone", "555"],
    storeSetting: [{ id: "store", displayCurrency: "EGP", usdToEgpRate: 50 }, "id", "usdToEgpRate", 51.5],
    catalogFabric: [{ key: "K", name: "N", gsm: "1", description: "d" }, "id", "active", false],
    catalogProduct: [{ product: "FITTED", name: "n", tagline: "t" }, "product", "tagline", "changed"],
    catalogPause: [{ product: "FITTED", fabric: "K" }, "id", "reason", "paused"],
    pricingRule: [{ product: "FITTED", fabric: "K", minQty: 1, maxQty: 9, unitPrice: 10.5 }, "id", "unitPrice", 12],
    placementPricingRule: [{ placement: "CENTER_FRONT", unitPrice: 2 }, "id", "unitPrice", 3],
    rateLimitBucket: [{ key: "k", count: 1, resetAt: new Date() }, "key", "count", 5],
  };
  for (const [accessor, [data, pkField, field, value]] of Object.entries(samples)) {
    test(`${accessor}: create / find / update / count / delete`, async () => {
      const { p } = fresh();
      const created = await p[accessor].create({ data });
      assert.ok(created);
      assert.equal(await p[accessor].count(), 1);
      const found = await p[accessor].findUnique({ where: { [pkField]: created[pkField] } });
      assert.equal(found[pkField], created[pkField]);
      await p[accessor].update({ where: { [pkField]: created[pkField] }, data: { [field]: value } });
      assert.equal((await p[accessor].findUnique({ where: { [pkField]: created[pkField] } }))[field], value);
      await p[accessor].delete({ where: { [pkField]: created[pkField] } });
      assert.equal(await p[accessor].count(), 0);
    });
  }
  test("build / buildDraft / asset / mockup / artwork / wishlistItem / bagItem / design / designPlacement", async () => {
    const { p } = fresh();
    await base(p);
    const m = await p.mockup.create({ data: { buildId: "b1", kind: "PRINT", data: Buffer.from("png"), fingerprint: "f" } });
    assert.equal(m.kind, "PRINT");
    const art = await p.artwork.create({ data: { userId: "u1", buildId: "b1", mimeType: "image/png", data: Buffer.from("x"), sha256: "h" } });
    await p.wishlistItem.create({ data: { userId: "u1", buildId: "b1", artworkId: art.id, placements: [] } });
    await p.bagItem.create({ data: { userId: "u1", buildId: "b1" } });
    const d = await p.design.create({ data: { buildId: "b1", placements: { create: [{ placement: "CENTER_FRONT", assetId: "a1" }] } } });
    assert.equal(await p.designPlacement.count({ where: { designId: d.id } }), 1);
    assert.equal((await p.bagItem.findFirst()).size, "M"); // default
    assert.equal((await p.buildDraft.findUnique({ where: { buildId: "b1" } })).quantity, 3);
    await p.buildDraft.update({ where: { buildId: "b1" }, data: { quantity: 4, printMockupId: m.id } });
    assert.equal((await p.buildDraft.findUnique({ where: { buildId: "b1" }, select: { quantity: true, printMockup: { select: { kind: true } } } })).printMockup.kind, "PRINT");
    await p.wishlistItem.deleteMany({ where: { userId: "u1" } });
    assert.equal(await p.wishlistItem.count(), 0);
  });
  test("defaults, updatedAt bump, enum and type validation, required fields", async () => {
    const { p } = fresh();
    const u = await p.user.create({ data: { email: "d@x.test" } });
    assert.equal(u.role, "USER");
    assert.ok(u.createdAt instanceof Date && typeof u.id === "string");
    const before = u.updatedAt.getTime();
    await new Promise((r) => setTimeout(r, 5));
    const up = await p.user.update({ where: { id: u.id }, data: { phone: "1" } });
    assert.ok(up.updatedAt.getTime() > before);
    await rejectsCode(p.user.create({ data: { role: "ROOT" } }), "P2009");
    await rejectsCode(p.user.create({ data: { email: 5 } }), "P2009");
    await rejectsCode(p.user.create({ data: { nope: 1 } }), "P2009");
    await rejectsCode(p.asset.create({ data: { fileName: "x" } }), "P2012"); // buildId required
    await rejectsCode(p.catalogFabric.create({ data: { key: "k" } }), "P2012");
  });
});

describe("relations, nested create, select / include / _count", () => {
  test("nested create of a to-one back relation and relation selects", async () => {
    const { p } = fresh();
    await base(p);
    const b = await p.build.findUnique({ where: { id: "b1" }, select: { id: true, draft: { select: { product: true, quantity: true } }, user: { select: { email: true } }, assets: { select: { id: true }, orderBy: { id: "asc" } } } });
    assert.deepEqual(b, { id: "b1", draft: { product: "FITTED", quantity: 3 }, user: { email: "a@x.test" }, assets: [{ id: "a1" }, { id: "a2" }] });
  });
  test("include returns scalars plus relations; _count counts relations", async () => {
    const { p } = fresh();
    await base(p);
    const b = await p.build.findUnique({ where: { id: "b1" }, include: { draft: true, _count: { select: { assets: true } } } });
    assert.equal(b.name, "One");
    assert.equal(b.draft.buildId, "b1");
    assert.deepEqual(b._count, { assets: 2 });
    const a = await p.asset.findUnique({ where: { id: "a1" }, select: { _count: { select: { orderItems: true, placements: true } } } });
    assert.deepEqual(a, { _count: { orderItems: 0, placements: 0 } });
  });
  test("nested connect and foreign-key checks", async () => {
    const { p } = fresh();
    await base(p);
    await p.build.create({ data: { id: "b3", user: { connect: { id: "u2" } } } });
    assert.equal((await p.build.findUnique({ where: { id: "b3" } })).userId, "u2");
    await rejectsCode(p.build.create({ data: { userId: "missing" } }), "P2003");
    await rejectsCode(p.build.create({ data: { user: { connect: { id: "missing" } } } }), "P2025");
    assert.equal(await p.build.count(), 3, "a failed create must leave nothing behind");
  });
  test("failed nested create is atomic (parent rolled back)", async () => {
    const { p } = fresh();
    await p.user.create({ data: { id: "u", email: "u@x.test" } });
    await rejectsCode(p.build.create({ data: { id: "bx", userId: "u", draft: { create: { quantity: 1.5 } } } }), "P2009");
    assert.equal(await p.build.count(), 0);
  });
  test("cascade, set-null and restrict on delete", async () => {
    const { p } = fresh();
    await base(p);
    await p.buildDraft.update({ where: { buildId: "b1" }, data: { primaryAssetId: "a1" } });
    await p.asset.delete({ where: { id: "a1" } }); // draft.primaryAssetId -> null
    assert.equal((await p.buildDraft.findUnique({ where: { buildId: "b1" } })).primaryAssetId, null);
    const d = await p.design.create({ data: { buildId: "b1", placements: { create: [{ placement: "CENTER_FRONT", assetId: "a2" }] } } });
    await rejectsCode(p.asset.delete({ where: { id: "a2" } }), "P2003"); // DesignPlacement.asset is restrict
    await p.build.delete({ where: { id: "b1" } }); // cascades draft, assets, designs, placements
    assert.equal(await p.asset.count({ where: { buildId: "b1" } }), 0);
    assert.equal(await p.designPlacement.count(), 0);
    assert.equal(await p.design.count({ where: { id: d.id } }), 0);
    assert.equal(await p.user.count({ where: { id: "u1" } }), 1);
  });
});

describe("where / orderBy / take / skip", () => {
  test("equality, null, in, notIn, not, lt/lte/gt/gte, contains, startsWith", async () => {
    const { p } = fresh();
    await base(p);
    assert.deepEqual((await p.asset.findMany({ where: { url: { not: null } }, orderBy: { id: "asc" } })).map((a) => a.id), ["a1", "a3"]);
    assert.deepEqual((await p.asset.findMany({ where: { hiddenAt: null }, orderBy: { id: "asc" } })).map((a) => a.id), ["a1", "a3"]);
    assert.deepEqual((await p.asset.findMany({ where: { id: { in: ["a1", "a3"] } }, orderBy: { id: "asc" } })).map((a) => a.id), ["a1", "a3"]);
    assert.deepEqual((await p.asset.findMany({ where: { id: { notIn: ["a1"] } }, orderBy: { id: "asc" } })).map((a) => a.id), ["a2", "a3"]);
    assert.equal(await p.buildDraft.count({ where: { quantity: { not: 1 } } }), 1);
    assert.equal(await p.buildDraft.count({ where: { quantity: { gte: 1, lte: 3 } } }), 2);
    assert.equal(await p.buildDraft.count({ where: { quantity: { gt: 1 } } }), 1);
    assert.equal(await p.buildDraft.count({ where: { quantity: { lt: 3 } } }), 1);
    assert.equal(await p.asset.count({ where: { fileName: { contains: "ne" } } }), 1);
    assert.equal(await p.asset.count({ where: { fileName: { startsWith: "t" } } }), 2);
    assert.equal(await p.asset.count({ where: { fileName: "one.png" } }), 1);
  });
  test("AND, OR, NOT and the Builder's relation-filter shorthand", async () => {
    const { p } = fresh();
    await base(p);
    const ids = async (where) => (await p.asset.findMany({ where, orderBy: { id: "asc" } })).map((a) => a.id);
    assert.deepEqual(await ids({ OR: [{ buildId: "b2" }, { build: { userId: "u1" } }] }), ["a1", "a2", "a3"]);
    assert.deepEqual(await ids({ OR: [{ buildId: "b2" }], AND: [{ OR: [{ cropSourceAssetId: null }, { id: { in: ["a3"] } }] }] }), ["a3"]);
    assert.deepEqual(await ids({ NOT: { buildId: "b1" } }), ["a3"]);
    assert.deepEqual(await ids({ build: { is: { userId: null } } }), ["a3"]);
    assert.deepEqual(await ids({ build: { isNot: { userId: null } } }), ["a1", "a2"]);
    assert.deepEqual((await p.build.findMany({ where: { assets: { some: { hiddenAt: { not: null } } } } })).map((b) => b.id), ["b1"]);
    assert.deepEqual((await p.build.findMany({ where: { assets: { none: {} } } })).map((b) => b.id), []);
    assert.deepEqual(await ids({ OR: [] }), []); // empty OR matches nothing, like Prisma
  });
  test("orderBy (asc/desc/multi, NULLs last on asc), take, skip", async () => {
    const { p } = fresh();
    await base(p);
    assert.deepEqual((await p.asset.findMany({ orderBy: { fileName: "desc" } })).map((a) => a.id), ["a2", "a3", "a1"]);
    assert.deepEqual((await p.asset.findMany({ orderBy: [{ hiddenAt: "asc" }, { id: "desc" }] })).map((a) => a.id), ["a2", "a3", "a1"]);
    assert.deepEqual((await p.asset.findMany({ orderBy: { id: "asc" }, take: 2 })).map((a) => a.id), ["a1", "a2"]);
    assert.deepEqual((await p.asset.findMany({ orderBy: { id: "asc" }, skip: 1, take: 1 })).map((a) => a.id), ["a2"]);
    assert.equal((await p.asset.findFirst({ orderBy: { id: "desc" } })).id, "a3");
  });
  test("updateMany / deleteMany return counts; Prisma.DbNull-style markers clear JSON", async () => {
    const { p } = fresh();
    await base(p);
    assert.deepEqual(await p.buildDraft.updateMany({ where: { buildId: "b1", quantity: { not: 1 } }, data: { quantity: 1 } }), { count: 1 });
    assert.deepEqual(await p.buildDraft.updateMany({ where: { buildId: "b1", quantity: { not: 1 } }, data: { quantity: 1 } }), { count: 0 });
    await p.buildDraft.update({ where: { buildId: "b1" }, data: { artworkLayers: [{ placement: "CENTER_FRONT" }] } });
    assert.deepEqual((await p.buildDraft.findUnique({ where: { buildId: "b1" } })).artworkLayers, [{ placement: "CENTER_FRONT" }]);
    await p.buildDraft.update({ where: { buildId: "b1" }, data: { artworkLayers: DbNull } });
    assert.equal((await p.buildDraft.findUnique({ where: { buildId: "b1" } })).artworkLayers, null);
    assert.deepEqual(await p.asset.deleteMany({ where: { buildId: "b1" } }), { count: 2 });
  });
  test("returned rows are copies (mutating them does not change the store)", async () => {
    const { p } = fresh();
    await base(p);
    await p.buildDraft.update({ where: { buildId: "b1" }, data: { artworkLayers: [{ a: 1 }] } });
    const r = await p.buildDraft.findUnique({ where: { buildId: "b1" } });
    r.artworkLayers.push({ a: 2 });
    r.quantity = 99;
    const again = await p.buildDraft.findUnique({ where: { buildId: "b1" } });
    assert.equal(again.quantity, 3);
    assert.deepEqual(again.artworkLayers, [{ a: 1 }]);
  });
});

describe("unique constraints and compound uniques", () => {
  test("compound unique where (userId_buildId, product_fabric) and P2002 on duplicates", async () => {
    const { p } = fresh();
    await base(p);
    await p.bagItem.create({ data: { userId: "u1", buildId: "b1", size: "L" } });
    assert.equal((await p.bagItem.findUnique({ where: { userId_buildId: { userId: "u1", buildId: "b1" } } })).size, "L");
    assert.equal(await p.bagItem.findUnique({ where: { userId_buildId: { userId: "u2", buildId: "b1" } } }), null);
    await rejectsCode(p.bagItem.create({ data: { userId: "u1", buildId: "b1" } }), "P2002");
    await p.catalogPause.create({ data: { product: "FITTED", fabric: "K", reason: "r" } });
    assert.equal((await p.catalogPause.findUnique({ where: { product_fabric: { product: "FITTED", fabric: "K" } }, select: { reason: true } })).reason, "r");
    await rejectsCode(p.user.create({ data: { email: "a@x.test" } }), "P2002");
    await rejectsCode(p.user.update({ where: { id: "u2" }, data: { email: "a@x.test" } }), "P2002");
  });
  test("upsert creates then updates; findUnique demands a unique field", async () => {
    const { p } = fresh();
    await base(p);
    const args = { where: { userId_buildId: { userId: "u1", buildId: "b1" } }, create: { userId: "u1", buildId: "b1", size: "S" }, update: { size: "XL" } };
    assert.equal((await p.bagItem.upsert(args)).size, "S");
    assert.equal((await p.bagItem.upsert(args)).size, "XL");
    assert.equal(await p.bagItem.count(), 1);
    await rejectsCode(p.bagItem.findUnique({ where: { size: "XL" } }), "P2009");
    await rejectsCode(p.bagItem.update({ where: { id: "nope" }, data: { size: "S" } }), "P2025");
    await rejectsCode(p.bagItem.findUniqueOrThrow({ where: { id: "nope" } }), "P2025");
  });
});

describe("$transaction", () => {
  test("success commits; failure rolls back everything done inside", async () => {
    const { p } = fresh();
    await base(p);
    const id = await p.$transaction(async (tx) => {
      const b = await tx.build.create({ data: { userId: "u1", name: "Copy", draft: { create: {} } } });
      await tx.asset.create({ data: { buildId: b.id, fileName: "c.png" } });
      return b.id;
    });
    assert.equal(await p.asset.count({ where: { buildId: id } }), 1);
    const before = { builds: await p.build.count(), assets: await p.asset.count() };
    await assert.rejects(p.$transaction(async (tx) => {
      await tx.build.create({ data: { name: "will vanish" } });
      await tx.asset.deleteMany({});
      throw new Error("boom");
    }), /boom/);
    assert.deepEqual({ builds: await p.build.count(), assets: await p.asset.count() }, before);
  });
  test("an operation that fails inside the transaction rolls the whole transaction back", async () => {
    const { p } = fresh();
    await base(p);
    const n = await p.build.count();
    await rejectsCode(p.$transaction(async (tx) => { await tx.build.create({ data: { name: "x" } }); await tx.build.create({ data: { userId: "ghost" } }); }), "P2003");
    assert.equal(await p.build.count(), n);
  });
  test("outside operations wait for an open transaction; the array form and nesting are rejected loudly", async () => {
    const { p } = fresh();
    await base(p);
    let order = [];
    const tx = p.$transaction(async (t) => { await new Promise((r) => setTimeout(r, 30)); await t.build.create({ data: { id: "bt" } }); order.push("tx"); });
    await new Promise((r) => setTimeout(r, 5));
    const outside = p.build.count().then((n) => { order.push("outside"); return n; });
    await tx;
    assert.equal(await outside, 3);
    assert.deepEqual(order, ["tx", "outside"]);
    await rejectsCode(p.$transaction([p.build.count()]), "FAKE_UNSUPPORTED");
    await rejectsCode(p.$transaction(async (t) => t.$transaction(async () => {})), "FAKE_UNSUPPORTED");
  });
});

describe("raw SQL: only the rate limiter, exactly", () => {
  const upsert = (p, key, resetAt) => p.$queryRaw`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimitBucket"."resetAt" <= NOW() THEN 1
          ELSE "RateLimitBucket"."count" + 1
        END,
        "resetAt" = CASE
          WHEN "RateLimitBucket"."resetAt" <= NOW() THEN ${resetAt}
          ELSE "RateLimitBucket"."resetAt"
        END
      RETURNING "count", "resetAt"
    `;
  test("counts up inside the window and restarts after it expires", async () => {
    const { p, db } = fresh();
    const future = new Date(Date.now() + 60000);
    assert.equal((await upsert(p, "k", future))[0].count, 1);
    assert.equal((await upsert(p, "k", future))[0].count, 2);
    assert.equal((await upsert(p, "other", future))[0].count, 1);
    db.tables.RateLimitBucket.find((r) => r.key === "k").resetAt = new Date(Date.now() - 1000);
    const again = await upsert(p, "k", future);
    assert.equal(again[0].count, 1);
    assert.equal(again[0].resetAt.getTime(), future.getTime());
  });
  test("cleanup DELETE removes only buckets expired more than a day ago", async () => {
    const { p, db } = fresh();
    db.tables.RateLimitBucket.push({ key: "old", count: 1, resetAt: new Date(Date.now() - 3 * 86400000) }, { key: "new", count: 1, resetAt: new Date() });
    const n = await p.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "resetAt" < NOW() - INTERVAL '1 day'`;
    assert.equal(n, 1);
    assert.deepEqual(db.tables.RateLimitBucket.map((r) => r.key), ["new"]);
  });
  test("any other SQL, unsafe variants, and non-template calls are rejected", async () => {
    const { p } = fresh();
    await rejectsCode(p.$queryRaw`SELECT 1`, "FAKE_UNSUPPORTED");
    await rejectsCode(p.$queryRaw`SELECT * FROM "User"`, "FAKE_UNSUPPORTED");
    await rejectsCode(p.$executeRaw`DELETE FROM "User"`, "FAKE_UNSUPPORTED");
    await rejectsCode(p.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "resetAt" < NOW() - INTERVAL '2 day'`, "FAKE_UNSUPPORTED");
    await rejectsCode(p.$queryRaw("SELECT 1"), "FAKE_UNSUPPORTED");
    assert.throws(() => p.$queryRawUnsafe("SELECT 1"), (e) => e.code === "FAKE_UNSUPPORTED");
    assert.throws(() => p.$executeRawUnsafe("DELETE FROM x"), (e) => e.code === "FAKE_UNSUPPORTED");
  });
  test("the expected SQL still matches the application's own rate limiter source", () => {
    const src = fs.readFileSync(path.join(REPO, "src/lib/rate-limit-db.ts"), "utf8");
    const grab = (re) => { const m = re.exec(src); assert.ok(m, "template not found in rate-limit-db.ts"); let i = 0; return m[1].replace(/\$\{[^}]*\}/g, () => `$${++i}`).replace(/\s+/g, " ").trim(); };
    assert.equal(grab(/\$queryRaw<[^>]*>`([\s\S]*?)`/), RATE_LIMIT_UPSERT_SQL);
    assert.equal(grab(/\$executeRaw`([\s\S]*?)`/), RATE_LIMIT_CLEANUP_SQL);
  });
});

describe("orders (added for the Bag/Orders/Checkout QA)", () => {
  test("order with nested items, payment attempt, relations, cascade and the checkout build lock", async () => {
    const { p } = fresh();
    await base(p);
    const order = await p.$transaction(async (tx) => {
      const lock = await tx.$queryRaw`SELECT id FROM "Build" WHERE id = ${"b1"} FOR UPDATE`;
      assert.deepEqual(lock, [{ id: "b1" }]);
      return tx.order.create({
        data: { orderNumber: "T-1", userId: "u1", buildId: "b1", subtotalCents: 100, totalCents: 100, paymentStatus: "PENDING", items: { create: { product: "OVERSIZED", color: "BLACK", fabric: "F", quantity: 2, unitPriceCents: 50, totalCents: 100, placements: ["CENTER_FRONT"], preview: { size: "M" }, assetId: "a1" } } },
        include: { items: true },
      });
    });
    assert.equal(order.items.length, 1);
    assert.equal(order.status, "NEW");
    assert.equal(order.currency, "EGP");
    await p.paymentAttempt.create({ data: { orderId: order.id, method: "CARD", amountCents: 100, currency: "EGP" } });
    const read = await p.order.findUnique({ where: { id: order.id }, include: { items: { orderBy: { createdAt: "asc" } } } });
    assert.equal(read.items[0].preview.size, "M");
    assert.equal((await p.paymentAttempt.findFirst({ where: { orderId: order.id }, orderBy: { createdAt: "desc" } })).status, "CREATED");
    assert.deepEqual((await p.asset.findUnique({ where: { id: "a1" }, select: { _count: { select: { orderItems: true } } } }))._count, { orderItems: 1 });
    await rejectsCode(p.order.create({ data: { orderNumber: "T-1", subtotalCents: 1, totalCents: 1 } }), "P2002");
    assert.deepEqual(await p.$queryRaw`SELECT id FROM "Build" WHERE id = ${"nope"} FOR UPDATE`, []);
    await p.order.delete({ where: { id: order.id } });
    assert.equal(await p.orderItem.count(), 0);
    assert.equal(await p.paymentAttempt.count(), 0);
  });
});


describe("payment path: row locks, create-intent semantics, failure log (queries copied from the route)", () => {
  async function orderWorld(p) {
    await base(p);
    await p.order.create({ data: { id: "o1", orderNumber: "P-1", userId: "u1", buildId: "b1", subtotalCents: 49500, totalCents: 49500, paymentStatus: "PENDING", items: { create: { product: "OVERSIZED", color: "BLACK", fabric: "F", quantity: 1, unitPriceCents: 990, totalCents: 990, placements: [] } } } });
    await p.order.create({ data: { id: "o2", orderNumber: "P-2", userId: "u2", subtotalCents: 100, totalCents: 100 } });
  }
  // The decision step of app/api/payments/paymob/create-intent/route.ts, query for query.
  const decide = (p, orderId, method = "CARD") => p.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const recent = await tx.paymentAttempt.findFirst({ where: { orderId, method, status: "PENDING", paymentUrl: { not: null }, createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } }, orderBy: { createdAt: "desc" } });
    if (recent?.paymentUrl) return { kind: "reuse", paymentUrl: recent.paymentUrl };
    const inFlight = await tx.paymentAttempt.findFirst({ where: { orderId, method, status: "CREATED", createdAt: { gte: new Date(Date.now() - 25 * 1000) } } });
    if (inFlight) return { kind: "in-flight" };
    const created = await tx.paymentAttempt.create({ data: { orderId, method, amountCents: 49500, currency: "EGP" } });
    return { kind: "created", attemptId: created.id };
  }, { maxWait: 8000, timeout: 8000 });

  test("each lock statement reads its OWN table: an Order lock never matches a Build and vice versa", async () => {
    const { p } = fresh();
    await orderWorld(p);
    assert.deepEqual(await p.$queryRaw`SELECT id FROM "Order" WHERE id = ${"o1"} FOR UPDATE`, [{ id: "o1" }]);
    assert.deepEqual(await p.$queryRaw`SELECT id FROM "Build" WHERE id = ${"b1"} FOR UPDATE`, [{ id: "b1" }]);
    assert.deepEqual(await p.$queryRaw`SELECT id FROM "Order" WHERE id = ${"b1"} FOR UPDATE`, [], "an Order lock must not find a Build id");
    assert.deepEqual(await p.$queryRaw`SELECT id FROM "Build" WHERE id = ${"o1"} FOR UPDATE`, [], "a Build lock must not find an Order id");
    assert.deepEqual(await p.$queryRaw`SELECT id FROM "Order" WHERE id = ${"nope"} FOR UPDATE`, []);
    assert.deepEqual(Object.keys(LOCK_SQL).sort(), ["Build", "Order"]);
    await loud(() => p.$queryRaw`SELECT id FROM "User" WHERE id = ${"u1"} FOR UPDATE`);
    await loud(() => p.$queryRaw`SELECT id FROM "Order" WHERE id = ${"o1"} FOR SHARE`);
    await loud(() => p.$queryRaw`SELECT * FROM "Order" WHERE id = ${"o1"} FOR UPDATE`);
  });

  test("the lock statements still match the application source", () => {
    const grab = (file, re) => { const m = re.exec(fs.readFileSync(path.join(REPO, file), "utf8")); assert.ok(m, `${file}: statement not found`); return m[1].replace(/\$\{[^}]*\}/g, "$1").replace(/\s+/g, " ").trim(); };
    assert.equal(grab("src/lib/orders/checkout.ts", /\$queryRaw`(SELECT id FROM "Build"[^`]*)`/), LOCK_SQL.Build);
    assert.equal(grab("app/api/payments/paymob/create-intent/route.ts", /\$queryRaw`(SELECT id FROM "Order"[^`]*)`/), LOCK_SQL.Order);
    assert.equal(grab("app/api/payments/paymob/webhook/route.ts", /\$queryRaw`(SELECT id FROM "Order"[^`]*)`/), LOCK_SQL.Order);
  });

  test("a fresh order: first decision creates an attempt; the next sees it in flight (no second attempt)", async () => {
    const { p } = fresh();
    await orderWorld(p);
    const first = await decide(p, "o1");
    assert.equal(first.kind, "created");
    assert.deepEqual(await decide(p, "o1"), { kind: "in-flight" });
    assert.equal(await p.paymentAttempt.count({ where: { orderId: "o1" } }), 1);
    const attempt = await p.paymentAttempt.findUnique({ where: { id: first.attemptId } });
    assert.deepEqual([attempt.status, attempt.amountCents, attempt.currency, attempt.provider], ["CREATED", 49500, "EGP", "PAYMOB"]);
  });

  test("concurrent double submit (two tabs): exactly one attempt is created, the other waits and sees it", async () => {
    const { p } = fresh();
    await orderWorld(p);
    const results = await Promise.all([decide(p, "o1"), decide(p, "o1"), decide(p, "o1")]);
    assert.deepEqual(results.map((r) => r.kind).sort(), ["created", "in-flight", "in-flight"]);
    assert.equal(await p.paymentAttempt.count({ where: { orderId: "o1" } }), 1);
  });

  test("pending attempt with a payment link is reused (same URL, no new attempt); an old or failed one is not", async () => {
    const { p } = fresh();
    await orderWorld(p);
    const link = "https://payments.example.invalid/pay/1";
    await p.paymentAttempt.create({ data: { orderId: "o1", method: "CARD", status: "PENDING", amountCents: 49500, currency: "EGP", paymentUrl: link, externalId: "x" } });
    assert.deepEqual(await decide(p, "o1"), { kind: "reuse", paymentUrl: link });
    assert.deepEqual(await decide(p, "o1", "WALLET").then((r) => r.kind), "created", "a different method does not reuse the card link");
    // 31 minutes later the same attempt is too old to reuse
    const row = (await p.paymentAttempt.findMany({ where: { orderId: "o1", method: "CARD" } }))[0];
    await p.paymentAttempt.update({ where: { id: row.id }, data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) } });
    assert.equal((await decide(p, "o1")).kind, "created");
    // failed attempts never block a retry
    const { p: q } = fresh();
    await orderWorld(q);
    const a = await decide(q, "o1");
    await q.paymentAttempt.update({ where: { id: a.attemptId }, data: { status: "FAILED", failureReason: "Paymob is not configured" } });
    assert.equal((await decide(q, "o1")).kind, "created");
    assert.equal(await q.paymentAttempt.count({ where: { orderId: "o1", status: "FAILED" } }), 1);
  });

  test("an error inside the decision transaction rolls everything back (no half-made attempt)", async () => {
    const { p } = fresh();
    await orderWorld(p);
    await assert.rejects(p.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${"o1"} FOR UPDATE`;
      await tx.paymentAttempt.create({ data: { orderId: "o1", method: "CARD", amountCents: 1, currency: "EGP" } });
      throw new Error("provider exploded");
    }), /provider exploded/);
    assert.equal(await p.paymentAttempt.count(), 0);
    assert.equal((await decide(p, "o1")).kind, "created", "the order is not left locked after a failure");
  });

  test("order ownership filter used by the retry path, and totals/currency round-trip", async () => {
    const { p } = fresh();
    await orderWorld(p);
    assert.equal(await p.order.findFirst({ where: { id: "o1", userId: "u2" }, include: { items: true } }), null, "another user's order id finds nothing");
    assert.equal(await p.order.findFirst({ where: { id: "o2", userId: "u1" } }), null);
    const mine = await p.order.findFirst({ where: { id: "o1", userId: "u1" }, include: { items: true } });
    assert.deepEqual([mine.currency, mine.totalCents, mine.subtotalCents, mine.paymentStatus, mine.status, mine.items.length], ["EGP", 49500, 49500, "PENDING", "NEW", 1]);
    await rejectsCode(p.order.update({ where: { id: "o1" }, data: { totalCents: 495.5 } }), "P2009");
    await rejectsCode(p.order.update({ where: { id: "o1" }, data: { paymentStatus: "HALF_PAID" } }), "P2009");
    const updated = await p.order.update({ where: { id: "o1" }, data: { customerName: "N", termsAcceptedAt: new Date(), termsVersion: "terms:default-v1|refunds:default-v1" }, include: { items: true } });
    assert.equal(updated.items.length, 1);
    assert.equal(updated.termsVersion, "terms:default-v1|refunds:default-v1");
  });

  test("failure log: adminAuditLog rows (checkout-failure.ts shape), FK to the order, set-null when the order goes away", async () => {
    const { p } = fresh();
    await orderWorld(p);
    const row = await p.adminAuditLog.create({ data: { orderId: "o1", action: "CHECKOUT_FAILED", newValue: "INTERNAL_ERROR", metadata: { userId: "u1", buildId: "b1", status: 500, message: "x" } } });
    assert.deepEqual([row.adminId, row.action, row.newValue, row.metadata.status], [null, "CHECKOUT_FAILED", "INTERNAL_ERROR", 500]);
    await p.adminAuditLog.create({ data: { orderId: null, action: "CHECKOUT_FAILED", newValue: "X" } }); // a failure before any order exists
    await rejectsCode(p.adminAuditLog.create({ data: { orderId: "ghost", action: "A" } }), "P2003");
    assert.equal(await p.adminAuditLog.count({ where: { action: "CHECKOUT_FAILED" } }), 2);
    await p.order.delete({ where: { id: "o1" } });
    assert.equal((await p.adminAuditLog.findUnique({ where: { id: row.id } })).orderId, null);
    assert.equal(await p.paymentAttempt.count(), 0);
  });

  test("still unsupported on purpose: the array form used after a real Paymob success", async () => {
    const { p } = fresh();
    await orderWorld(p);
    await loud(() => p.$transaction([p.order.count(), p.paymentAttempt.count()]));
  });
});

describe("webhook / notes / legal pages (added for the double-payment and terms tests)", () => {
  test("WebhookEvent idempotency key, AdminNote cascade, LegalPage updatedAt", async () => {
    const { p } = fresh();
    await base(p);
    await p.order.create({ data: { id: "o1", orderNumber: "W-1", subtotalCents: 1, totalCents: 1 } });
    await p.webhookEvent.create({ data: { eventKey: "k1", eventType: "TRANSACTION", validSignature: true, payload: { a: 1 }, orderId: "o1" } });
    await rejectsCode(p.webhookEvent.create({ data: { eventKey: "k1", eventType: "TRANSACTION", validSignature: true, payload: {} } }), "P2002");
    const ev = await p.webhookEvent.update({ where: { eventKey: "k1" }, data: { processed: true, processedAt: new Date() } });
    assert.equal(ev.processed, true);
    await p.adminNote.create({ data: { orderId: "o1", body: "review" } });
    await rejectsCode(p.adminNote.create({ data: { orderId: "ghost", body: "x" } }), "P2003");
    const page = await p.legalPage.create({ data: { slug: "terms", title: "T", body: "b" } });
    await new Promise((r) => setTimeout(r, 5));
    const edited = await p.legalPage.update({ where: { slug: "terms" }, data: { body: "b2" } });
    assert.ok(edited.updatedAt.getTime() > page.updatedAt.getTime());
    await p.order.delete({ where: { id: "o1" } });
    assert.equal(await p.adminNote.count(), 0, "notes go with the order");
    assert.equal((await p.webhookEvent.findUnique({ where: { eventKey: "k1" } })).orderId, null, "the delivery log is kept, detached");
  });
});

describe("order relations used by the admin order page and system health", () => {
  test("include notes / auditLogs (with take + orderBy) and the auditLogs.some count filter", async () => {
    const { p } = fresh();
    await base(p);
    for (const id of ["o1", "o2"]) await p.order.create({ data: { id, orderNumber: `A-${id}`, subtotalCents: 1, totalCents: 1, status: "PAID", paymentStatus: "PAID" } });
    const tick = () => new Promise((r) => setTimeout(r, 3)); // distinct createdAt values, so "newest first" is well defined
    await p.adminAuditLog.create({ data: { orderId: "o1", action: "PAYMOB_DUPLICATE_DESIGN_PAYMENT" } });
    for (let i = 0; i < 5; i += 1) { await tick(); await p.adminAuditLog.create({ data: { orderId: "o1", action: "QA_NOISE", newValue: String(i) } }); }
    await p.adminNote.create({ data: { orderId: "o1", body: "review" } });
    const loaded = await p.order.findUnique({ where: { id: "o1" }, include: { notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { email: true } } } }, auditLogs: { orderBy: { createdAt: "desc" }, take: 3, include: { admin: { select: { email: true } } } } } });
    assert.equal(loaded.notes.length, 1);
    assert.equal(loaded.auditLogs.length, 3, "take limits the nested list");
    assert.ok(!loaded.auditLogs.some((l) => l.action === "PAYMOB_DUPLICATE_DESIGN_PAYMENT"), "the old entry is outside the last 3, as in the admin page's last-50 list");
    assert.equal(await p.order.count({ where: { status: "PAID", paymentStatus: "PAID", auditLogs: { some: { action: "PAYMOB_DUPLICATE_DESIGN_PAYMENT" } } } }), 1);
    const direct = await p.adminAuditLog.findFirst({ where: { orderId: "o1", action: "PAYMOB_DUPLICATE_DESIGN_PAYMENT" }, orderBy: { createdAt: "desc" }, select: { metadata: true } });
    assert.ok(direct, "a targeted lookup finds it regardless of how many entries came later");
  });
});

describe("unsupported things fail loudly (never empty results)", () => {
  test("unknown models, methods, arguments, operators and clients", async () => {
    const { p } = fresh();
    await loud(() => p.account.findMany(), "FAKE_UNSUPPORTED");
    await loud(() => p.session.findUnique({ where: { id: "x" } }), "FAKE_UNSUPPORTED");
    await loud(() => p.bespokeRequest.findMany(), "FAKE_UNSUPPORTED");
    await loud(() => p.user.groupBy({ by: ["role"] }), "FAKE_UNSUPPORTED");
    await loud(() => p.user.aggregate({ _count: true }), "FAKE_UNSUPPORTED");
    await loud(() => p.user.createMany({ data: [] }), "FAKE_UNSUPPORTED");
    await loud(() => p.user.findMany({ distinct: ["role"] }), "FAKE_UNSUPPORTED");
    await loud(() => p.user.findMany({ cursor: { id: "x" } }), "FAKE_UNSUPPORTED");
    await loud(() => p.user.findMany({ where: { email: { mode: "insensitive", contains: "a" } } }), "FAKE_UNSUPPORTED");
    await loud(() => p.user.findMany({ where: { nope: 1 } }), "FAKE_UNSUPPORTED");
    await loud(() => p.user.findMany({ select: { nope: true } }), "FAKE_UNSUPPORTED");
    await loud(() => p.user.findMany({ include: { sessions: true } }), "FAKE_UNSUPPORTED");
    await loud(() => p.user.findMany({ orderBy: { builds: { _count: "asc" } } }), "FAKE_UNSUPPORTED");
    await loud(() => p.buildDraft.update({ where: { buildId: "x" }, data: { quantity: { increment: 1 } } }), "FAKE_UNSUPPORTED");
    await loud(() => p.buildDraft.findMany({ where: { artworkLayers: { path: ["a"], equals: 1 } } }), "FAKE_UNSUPPORTED");
    await loud(() => p.build.update({ where: { id: "x" }, data: { draft: { update: { quantity: 1 } } } }), "FAKE_UNSUPPORTED");
    await loud(() => p.build.create({ data: { draft: { connectOrCreate: {} } } }), "FAKE_UNSUPPORTED");
    await loud(() => p.user.findMany({ select: { id: true }, include: { builds: true } }), "P2009");
    assert.throws(() => p.$on("query", () => {}), (e) => e.code === "FAKE_UNSUPPORTED");
    assert.throws(() => p.$use(() => {}), (e) => e.code === "FAKE_UNSUPPORTED");
    assert.throws(() => p.$extends({}), (e) => e.code === "FAKE_UNSUPPORTED");
  });
  test("the supported model list is exactly the Studio/Builder path", () => {
    assert.deepEqual([...SUPPORTED_MODELS].sort(), ["AdminAuditLog", "AdminNote", "Artwork", "Asset", "BagItem", "Build", "BuildDraft", "CatalogFabric", "CatalogPause", "CatalogProduct", "Design", "DesignPlacement", "LegalPage", "Mockup", "Order", "OrderItem", "PaymentAttempt", "PlacementPricingRule", "PricingRule", "RateLimitBucket", "StoreSetting", "User", "WebhookEvent", "WishlistItem"]);
  });
});

describe("shared state through globalThis.__TGFM_FAKE_DB__ (seeded entry point)", () => {
  test("repeated and cache-busted imports share one database and one seed", async () => {
    delete globalThis.__TGFM_FAKE_DB__;
    const url = pathToFileURL(path.join(DIR, "index.mjs")).href;
    const a = await import(url);
    const b = await import(`${url}?second-module-instance`);
    const c = await import(`${url}?third-module-instance`);
    assert.notStrictEqual(a.prisma, b.prisma, "separate module instances (like RSC vs SSR layers)");
    assert.strictEqual(globalThis.__TGFM_FAKE_DB__, a.getFakeDb());
    await a.prisma.build.create({ data: { id: "shared-1", name: "from A" } });
    assert.equal((await b.prisma.build.findUnique({ where: { id: "shared-1" } })).name, "from A");
    await c.prisma.build.update({ where: { id: "shared-1" }, data: { name: "from C" } });
    assert.equal((await a.prisma.build.findUnique({ where: { id: "shared-1" } })).name, "from C");
    assert.equal(await a.prisma.user.count({ where: { email: "test@tgfm.test" } }), 1, "seeded exactly once");
    delete globalThis.__TGFM_FAKE_DB__;
  });
  test("the seed supports the Studio/Builder reads and the test login hash verifies", async () => {
    delete globalThis.__TGFM_FAKE_DB__;
    const m = await import(`${pathToFileURL(path.join(DIR, "index.mjs")).href}?seed-check`);
    const seed = await import(pathToFileURL(path.join(DIR, "seed.mjs")).href);
    const { prisma } = m;
    const user = await prisma.user.findUnique({ where: { email: seed.TEST_USER.email } });
    const argon2 = (await import("argon2")).default ?? (await import("argon2"));
    assert.equal(await argon2.verify(user.passwordHash, seed.TEST_USER.password), true);
    assert.equal(await argon2.verify(user.passwordHash, "wrong"), false);
    const store = await prisma.storeSetting.findUnique({ where: { id: "store" }, select: { displayCurrency: true, usdToEgpRate: true } });
    assert.deepEqual(store, { displayCurrency: "EGP", usdToEgpRate: 50 });
    assert.equal((await prisma.catalogFabric.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] })).length, 3);
    assert.equal((await prisma.catalogProduct.findMany()).length, 2);
    const build = await prisma.build.findFirst({ where: { userId: user.id, status: "ACTIVE" }, orderBy: { updatedAt: "desc" }, select: { id: true } });
    assert.ok([seed.IDS.cartBuild2, seed.IDS.cartBuild3, seed.IDS.multiBuild, seed.IDS.dupBuild, seed.IDS.liveBuild, seed.IDS.expiredBuild, seed.IDS.flightBuild, seed.IDS.webhookBuild].includes(build.id), "/studio resumes one of the most recently created builds of the user");
    assert.equal(await prisma.bagItem.count({ where: { userId: user.id } }), 3, "the seeded bag has three items");
    const page = await prisma.build.findUnique({ where: { id: seed.IDS.savedBuild }, select: { id: true, name: true, draft: { select: { id: true, product: true, printMockup: { select: { id: true, mimeType: true } }, artworkLayers: true } }, designs: { select: { placements: { select: { id: true } } } } } });
    assert.equal(page.draft.printMockup.mimeType, "image/png");
    assert.equal(page.draft.artworkLayers.length, 1);
    const assets = await prisma.asset.findMany({ where: { url: { not: null }, hiddenAt: null, OR: [{ buildId: build.id }, { build: { userId: user.id } }], AND: [{ OR: [{ cropSourceAssetId: null }, { id: { in: [seed.IDS.savedAsset] } }] }] }, orderBy: { createdAt: "desc" }, take: 48, select: { id: true, url: true } });
    assert.equal(assets.length, 3, "the saved upload plus the uploads of the second bag design and the two-placement design");
    const file = await prisma.asset.findUnique({ where: { id: seed.IDS.savedAsset }, select: { artworkData: true, mimeType: true } });
    assert.ok(Buffer.isBuffer(file.artworkData) && file.artworkData.length > 0);
    assert.equal(await prisma.build.count({ where: { userId: null } }), 1); // guest build
    assert.equal(await prisma.build.count({ where: { userId: seed.OTHER_USER.id } }), 1);
    delete globalThis.__TGFM_FAKE_DB__;
  });
  test("the fake directory never imports the Prisma client or runtime", () => {
    for (const f of fs.readdirSync(DIR)) {
      const text = fs.readFileSync(path.join(DIR, f), "utf8");
      assert.ok(!/@prisma\/client/.test(text), `${f} references @prisma/client`);
      assert.ok(!/new\s+PrismaClient\b/.test(text), `${f} creates a PrismaClient`);
    }
  });
});
