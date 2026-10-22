import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const startupSeed = readFileSync("src/lib/db/index.ts", "utf8");
const manualSeed = readFileSync("scripts/seed.ts", "utf8");
const seedHelper = readFileSync("src/lib/db/seed-catalog.ts", "utf8");

test("automatic catalog seeding delegates to an additive helper", () => {
  const start = startupSeed.indexOf("async function seedCatalogIfEmpty");
  const end = startupSeed.indexOf("/**", start + 10);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const body = startupSeed.slice(start, end);
  assert.doesNotMatch(body, /\.delete\s*\(/);
  assert.match(body, /seedMissingCatalog\(db\)/);
});

test("the shared catalog seed helper never rewrites or deletes existing rows", () => {
  assert.doesNotMatch(seedHelper, /\.delete\s*\(/);
  assert.doesNotMatch(seedHelper, /\.update\s*\(/);
  assert.equal((seedHelper.match(/onConflictDoNothing/g) ?? []).length, 2);
});

test("manual seed refuses production and requires opt-in for remote targets", () => {
  assert.match(manualSeed, /NODE_ENV === "production"/);
  assert.match(manualSeed, /ALLOW_REMOTE_SEED/);
  assert.doesNotMatch(manualSeed, /\.delete\s*\(/);
  assert.match(manualSeed, /seedMissingCatalog\(/);
});
