// REAL PostgreSQL: transactions, rollback, persistence, foreign keys, unique keys and concurrency for the tables the shop relies on.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { prisma } from "./helpers.mjs";

after(() => prisma.$disconnect());
const uid = () => `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
const mkUser = (tag = "u") => prisma.user.create({ data: { email: `${tag}-${uid()}@dbtest.local`, passwordHash: "x", role: "USER" } });
const orderData = (userId, orderNumber) => ({
  orderNumber, userId, currency: "EGP", subtotalCents: 49500, totalCents: 49500, canonicalTotalUsdCents: 990, exchangeRateUsed: 50,
  customerName: "T", customerEmail: "t@dbtest.local", customerPhone: "1", shippingCountry: "EG", shippingCity: "Cairo", shippingAddressLine1: "1 St",
});

test("rollback: an interactive transaction that throws leaves NOTHING behind (order, item and attempt together)", async () => {
  const user = await mkUser("rb"); const orderNumber = `RB-${uid()}`;
  await assert.rejects(() => prisma.$transaction(async (tx) => {
    const order = await tx.order.create({ data: orderData(user.id, orderNumber) });
    await tx.orderItem.create({ data: { orderId: order.id, product: "FITTED", color: "WHITE", fabric: "ESSENTIALS_170", quantity: 1, unitPriceCents: 990, totalCents: 990, placements: ["CENTER_FRONT"], preview: {} } });
    await tx.paymentAttempt.create({ data: { orderId: order.id, method: "CARD", amountCents: 49500, currency: "EGP" } });
    throw new Error("simulated failure after three writes");
  }), /simulated failure/);
  assert.equal(await prisma.order.count({ where: { orderNumber } }), 0);
  assert.equal(await prisma.orderItem.count({ where: { order: { orderNumber } } }), 0);
});

test("rollback: a unique violation in the middle of a transaction undoes the writes before it", async () => {
  const user = await mkUser("rb2"); const taken = `TK-${uid()}`; const second = `SC-${uid()}`;
  await prisma.order.create({ data: orderData(user.id, taken) });
  await assert.rejects(() => prisma.$transaction(async (tx) => {
    await tx.order.create({ data: orderData(user.id, second) });  // would succeed
    await tx.order.create({ data: orderData(user.id, taken) });   // duplicate orderNumber -> P2002
  }), (e) => e.code === "P2002");
  assert.equal(await prisma.order.count({ where: { orderNumber: second } }), 0, "the first insert was rolled back too");
});

test("persistence: committed data is visible to a brand-new connection after the writer disconnects", async () => {
  const email = `persist-${uid()}@dbtest.local`;
  const writer = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  await writer.user.create({ data: { email, passwordHash: "x", role: "USER" } });
  await writer.$disconnect();
  const reader = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  assert.equal((await reader.user.findUnique({ where: { email } }))?.email, email);
  await reader.$disconnect();
});

test("unique keys under concurrency: 20 simultaneous orders with ONE orderNumber -> exactly one row", async () => {
  const user = await mkUser("uq"); const orderNumber = `UQ-${uid()}`;
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => prisma.order.create({ data: orderData(user.id, orderNumber) })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(results.filter((r) => r.status === "rejected").every((r) => r.reason?.code === "P2002"));
  assert.equal(await prisma.order.count({ where: { orderNumber } }), 1);
});

test("bag: 30 simultaneous 'add the same build' upserts keep ONE row per (user, build); distinct builds all land", async () => {
  const user = await mkUser("bag");
  const build = await prisma.build.create({ data: { userId: user.id, name: "b", status: "ACTIVE" } });
  const other = await prisma.build.create({ data: { userId: user.id, name: "c", status: "ACTIVE" } });
  const upsert = (buildId, size) => prisma.bagItem.upsert({ where: { userId_buildId: { userId: user.id, buildId } }, update: { size }, create: { userId: user.id, buildId, size } });
  const settled = await Promise.allSettled([...Array.from({ length: 30 }, (_, i) => upsert(build.id, i % 2 ? "M" : "L")), upsert(other.id, "S")]);
  // Prisma upsert can lose a race with a P2002 on a brand-new key; the app retries/ignores it. What must hold is the end state:
  assert.ok(settled.filter((r) => r.status === "rejected").every((r) => r.reason?.code === "P2002"), "only unique-race errors are possible");
  assert.equal(await prisma.bagItem.count({ where: { userId: user.id, buildId: build.id } }), 1);
  assert.equal(await prisma.bagItem.count({ where: { userId: user.id } }), 2);
});

test("foreign keys: an asset for a build that does not exist is refused (P2003); deleting a build removes its assets", async () => {
  const user = await mkUser("fk");
  await assert.rejects(() => prisma.asset.create({ data: { buildId: "no-such-build", fileName: "x.png", status: "READY" } }), (e) => e.code === "P2003");
  const build = await prisma.build.create({ data: { userId: user.id, name: "fk", status: "ACTIVE" } });
  await prisma.asset.create({ data: { buildId: build.id, fileName: "x.png", status: "READY" } });
  await prisma.build.delete({ where: { id: build.id } });
  assert.equal(await prisma.asset.count({ where: { buildId: build.id } }), 0, "cascade");
});

test("ownership scoping: deleteMany scoped by userId can never remove another user's bag row", async () => {
  const a = await mkUser("oa"); const b = await mkUser("ob");
  const build = await prisma.build.create({ data: { userId: a.id, name: "o", status: "ACTIVE" } });
  const item = await prisma.bagItem.create({ data: { userId: a.id, buildId: build.id, size: "M" } });
  assert.equal((await prisma.bagItem.deleteMany({ where: { id: item.id, userId: b.id } })).count, 0);
  assert.equal(await prisma.bagItem.count({ where: { id: item.id } }), 1);
  assert.equal((await prisma.bagItem.deleteMany({ where: { id: item.id, userId: a.id } })).count, 1);
});

test("SERIALIZABLE: two concurrent 'no admin exists yet -> insert an admin' transactions cannot both commit (the admin bootstrap guard)", async () => {
  await prisma.user.deleteMany({ where: { role: "ADMIN" } });
  const attempt = (n) => prisma.$transaction(async (tx) => {
    const admins = await tx.user.count({ where: { role: "ADMIN" } });
    await new Promise((r) => setTimeout(r, 150)); // widen the race window
    if (admins === 0) await tx.user.create({ data: { email: `boot${n}-${uid()}@dbtest.local`, passwordHash: "x", role: "ADMIN" } });
    return admins;
  }, { isolationLevel: "Serializable" });
  const results = await Promise.allSettled([attempt(1), attempt(2)]);
  assert.equal(await prisma.user.count({ where: { role: "ADMIN" } }), 1, "exactly one admin was created");
  assert.ok(results.some((r) => r.status === "rejected" && r.reason?.code === "P2034"), "the loser is aborted with a serialization failure (the route retries it)");
});

test("row lock: FOR UPDATE on an Order serialises 15 concurrent read-modify-write transactions (no lost update)", async () => {
  const user = await mkUser("lk");
  const order = await prisma.order.create({ data: { ...orderData(user.id, `LK-${uid()}`), paymentFailureReason: "0" } });
  await Promise.all(Array.from({ length: 15 }, () => prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
    const current = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
    await tx.order.update({ where: { id: order.id }, data: { paymentFailureReason: String(Number(current.paymentFailureReason) + 1) } });
  }, { maxWait: 20_000, timeout: 30_000 })));
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentFailureReason, "15");
});
