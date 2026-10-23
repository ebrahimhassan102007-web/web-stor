import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("drizzle/0002_authentication.sql", "utf8");

test("authentication migration is additive and never mutates existing storefront data", () => {
  const createdTables = [...migration.matchAll(/CREATE TABLE "([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(createdTables.sort(), [
    "account_sessions",
    "auth_rate_limits",
    "email_verification_codes",
    "google_oauth_states",
    "users",
  ]);
  assert.doesNotMatch(migration, /^\s*(DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s)/im);
  assert.doesNotMatch(migration, /ALTER TABLE "(categories|products|carts|cart_items|orders|order_items)"/i);
  assert.match(migration, /REFERENCES "public"\."users"\("id"\) ON DELETE cascade/i);
});
