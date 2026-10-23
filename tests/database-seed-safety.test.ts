import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveDatabaseUrl } from "../src/lib/db/config";

const runtime = readFileSync("src/lib/db/index.ts", "utf8");
const startup = readFileSync("src/instrumentation.ts", "utf8");
const manualSeed = readFileSync("scripts/seed.ts", "utf8");
const seedHelper = readFileSync("src/lib/db/seed-catalog.ts", "utf8");
const drizzleConfig = readFileSync("drizzle.config.ts", "utf8");
const migrationScript = readFileSync("scripts/migrate.ts", "utf8");

test("runtime database access never selects an embedded fallback or migrates at startup", () => {
  assert.doesNotMatch(runtime, /pglite|embedded-postgres/i);
  assert.match(runtime, /resolveDatabaseUrl\(\)/);
  assert.doesNotMatch(runtime, /migrateNode|migratePglite|ensureDbReady|seedMissingCatalog/);
  assert.match(startup, /assertDatabaseConfigured/);
  assert.doesNotMatch(startup, /ensureDbReady|migrateNode|migratePglite|seedMissingCatalog|migrateDatabase/);
});

test("database configuration fails closed for missing and malformed URLs", () => {
  for (const env of [
    {},
    { NODE_ENV: "development" },
    { NODE_ENV: "production" },
    { DATABASE_URL: "" },
    { DATABASE_URL: "not a url" },
    { DATABASE_URL: "mysql://localhost/store" },
    { DATABASE_URL: "postgres://" },
    { DATABASE_URL: "postgres:///store" },
    { DATABASE_URL: "postgres://localhost" },
    { DATABASE_URL: "postgres://localhost/store?host=other-host" },
  ]) {
    assert.throws(() => resolveDatabaseUrl(env), /DATABASE_URL|postgres/);
  }

  for (const url of [
    "postgres://user:pass@localhost:5432/evora_test",
    "postgresql://user:pass@db.example.com/evora",
  ]) {
    assert.equal(resolveDatabaseUrl({ NODE_ENV: "production", DATABASE_URL: url }), url);
  }
});

test("the shared catalog seed helper never rewrites or deletes existing rows", () => {
  assert.doesNotMatch(seedHelper, /\.delete\s*\(/);
  assert.doesNotMatch(seedHelper, /\.update\s*\(/);
  assert.equal((seedHelper.match(/onConflictDoNothing/g) ?? []).length, 2);
});

test("Drizzle Kit and manual seeding require explicit PostgreSQL targets", () => {
  assert.match(drizzleConfig, /DRIZZLE_KIT_DATABASE_URL/);
  assert.match(drizzleConfig, /resolveDatabaseUrl/);
  assert.doesNotMatch(drizzleConfig, /driver:\s*["']pglite|from\s*["'].*pglite/i);
  assert.match(manualSeed, /NODE_ENV === "production"/);
  assert.match(manualSeed, /ALLOW_REMOTE_SEED/);
  assert.match(manualSeed, /resolveDatabaseUrl/);
  assert.match(manualSeed, /seedMissingCatalog\(/);
  assert.doesNotMatch(manualSeed, /migrateNode|migratePglite|PGlite|\.delete\s*\(/i);
});

test("schema changes are an explicit, guarded command rather than an application side effect", () => {
  assert.match(migrationScript, /migratePostgres/);
  assert.match(migrationScript, /--adopt-existing/);
  assert.match(migrationScript, /--dry-run/);
  assert.match(migrationScript, /ALLOW_REMOTE_MIGRATION/);
  assert.match(migrationScript, /CONFIRM_PRODUCTION_BACKUP/);
});
