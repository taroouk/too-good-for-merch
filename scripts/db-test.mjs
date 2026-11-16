#!/usr/bin/env node
// file: scripts/db-test.mjs
//
// Runs the real-PostgreSQL tests in db-tests/ (transactions, locks, unique constraints, concurrency) against a THROWAWAY LOCAL
// database only. It refuses to do anything unless every one of these holds:
//   * TEST_DATABASE_URL is set (DATABASE_URL is never used, never read from .env);
//   * the host is localhost / 127.0.0.1 / ::1 (never a hosted provider);
//   * the database name contains "test";
//   * it is not the same URL as DATABASE_URL in the environment or in .env / .env.local;
//   * the database is EMPTY (no tables), so `prisma migrate deploy` only ever builds a fresh schema.
// With no TEST_DATABASE_URL it prints BLOCKED and exits 3 -- it never falls back to anything else.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.TEST_DATABASE_URL;
const refuse = (why) => { console.error(`db-test: REFUSED -- ${why}`); process.exit(2); };

if (!url) { console.error("db-test: BLOCKED -- set TEST_DATABASE_URL to an empty local test database (e.g. postgresql://postgres@localhost:5432/tgfm_test). Nothing was run."); process.exit(3); }

let parsed;
try { parsed = new URL(url); } catch { refuse("TEST_DATABASE_URL is not a valid URL"); }
if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(parsed.hostname)) refuse(`host "${parsed.hostname}" is not local`);
const dbName = parsed.pathname.replace(/^\//, "");
if (!/test/i.test(dbName)) refuse(`database name "${dbName}" must contain "test"`);
if (/neon\.tech|supabase|amazonaws|render\.com|railway|azure|gcp|cloud/i.test(url)) refuse("the URL looks like a hosted provider");

const sameAsKnown = (candidate) => candidate && candidate.replace(/["']/g, "").trim() === url;
if (sameAsKnown(process.env.DATABASE_URL)) refuse("TEST_DATABASE_URL equals DATABASE_URL");
for (const f of [".env", ".env.local"]) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  const m = fs.readFileSync(p, "utf8").match(/^DATABASE_URL\s*=\s*(.*)$/m);
  if (m && sameAsKnown(m[1])) refuse(`TEST_DATABASE_URL equals DATABASE_URL in ${f}`);
}

const env = { ...process.env, DATABASE_URL: url }; // only this child process sees it
const sh = (cmd, args) => spawnSync(cmd, args, { cwd: root, env, encoding: "utf8", stdio: "pipe" });

// the database must be empty
const probe = sh("node", ["-e", `
  const { PrismaClient } = require("@prisma/client");
  const p = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  p.$queryRawUnsafe("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'")
    .then((r) => { console.log(r[0].n); return p.$disconnect(); }).catch((e) => { console.error(String(e.message || e)); process.exit(1); });
`]);
if (probe.status !== 0) refuse(`could not connect to the test database: ${probe.stderr.trim().slice(0, 200)}`);
if (Number(probe.stdout.trim()) !== 0) refuse(`the test database is not empty (${probe.stdout.trim()} tables); drop and recreate it`);

console.log("db-test: applying migrations to the empty local test database ...");
const mig = sh("npx", ["prisma", "migrate", "deploy"]);
process.stdout.write(mig.stdout); process.stderr.write(mig.stderr);
if (mig.status !== 0) { console.error("db-test: migrations failed"); process.exit(1); }

const files = fs.readdirSync(path.join(root, "db-tests")).filter((f) => f.endsWith(".test.mjs")).map((f) => path.join("db-tests", f));
const run = spawnSync("node", ["--test", ...files], { cwd: root, env, stdio: "inherit" });
process.exit(run.status ?? 1);
