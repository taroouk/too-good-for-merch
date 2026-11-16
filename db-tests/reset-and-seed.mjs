// Empties every application table of the LOCAL TEST database and loads the same fixtures the fake-database QA uses, so the route QA
// scripts can run against real PostgreSQL. Refuses anything that is not the disposable local test database (same rules as scripts/db-test.mjs).
import { PrismaClient } from "@prisma/client";
import { seedDatabase } from "../scripts/isolation/fake-prisma/seed.mjs";

const url = process.env.TEST_DATABASE_URL;
if (!url) { console.error("reset-and-seed: BLOCKED -- TEST_DATABASE_URL is not set"); process.exit(3); }
const u = new URL(url);
if (!["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) || !/test/i.test(u.pathname)) { console.error(`reset-and-seed: REFUSED -- ${u.hostname}${u.pathname} is not a local test database`); process.exit(2); }
const prisma = new PrismaClient({ datasources: { db: { url } } });
const id = await prisma.$queryRawUnsafe("select current_database() db, inet_server_addr()::text addr, inet_server_port() port");
if (id[0].db !== u.pathname.slice(1) || !/^127\.0\.0\.1|^::1/.test(id[0].addr)) { console.error("reset-and-seed: REFUSED -- the connected server is not the expected local database", id[0]); process.exit(2); }
const tables = (await prisma.$queryRawUnsafe(`select tablename from pg_tables where schemaname='public' and tablename <> '_prisma_migrations'`)).map((r) => `"${r.tablename}"`);
await prisma.$executeRawUnsafe(`TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
if (!process.argv.includes("--empty")) await seedDatabase(prisma);
console.log(`reset-and-seed: ${id[0].db} @ ${id[0].addr}:${id[0].port} emptied (${tables.length} tables)${process.argv.includes("--empty") ? "" : " and seeded"}`);
await prisma.$disconnect();
