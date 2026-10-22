import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { Client } from "pg";
import {
  loadMigrations,
  migratePostgres,
} from "../src/lib/db/migrations";
import {
  assertTestDatabaseTarget,
  type TestDatabaseTarget,
} from "../src/lib/db/test-database";

const configured = process.env.TEST_DATABASE_URL?.trim();
const target: TestDatabaseTarget | null = configured
  ? assertTestDatabaseTarget(process.env)
  : null;
const skip = target
  ? false
  : "TEST_DATABASE_URL is not set — PostgreSQL migration compatibility requires a disposable *_test database";

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function databaseUrl(base: string, databaseName: string): string {
  const url = new URL(base);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function createDatabase(admin: Client, name: string): Promise<void> {
  await admin.query(`CREATE DATABASE ${quoteIdentifier(name)}`);
}

async function dropDatabase(admin: Client, name: string): Promise<void> {
  await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`);
}

test(
  "real PostgreSQL supports fresh install and data-preserving legacy adoption",
  { skip },
  async () => {
    assert.ok(target);
    const suffix = `${Date.now()}_${randomBytes(4).toString("hex")}`;
    const freshName = `evora_fresh_${suffix}_test`;
    const legacyName = `evora_legacy_${suffix}_test`;
    const admin = new Client({ connectionString: target.connectionString });
    await admin.connect();
    try {
      await createDatabase(admin, freshName);
      await createDatabase(admin, legacyName);

      const freshUrl = databaseUrl(target.connectionString, freshName);
      const fresh = await migratePostgres({ connectionString: freshUrl });
      assert.equal(fresh.applied.length, 3);
      const freshAgain = await migratePostgres({ connectionString: freshUrl });
      assert.equal(freshAgain.operations.every((operation) => operation.action === "unchanged"), true);

      const freshClient = new Client({ connectionString: freshUrl });
      await freshClient.connect();
      try {
        const tables = await freshClient.query<{ tablename: string }>(
          "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
        );
        for (const table of ["users", "account_sessions", "products", "orders"]) {
          assert.ok(tables.rows.some((row) => row.tablename === table), table);
        }
      } finally {
        await freshClient.end();
      }

      // Build exactly the previous storefront history, without its migration
      // bookkeeping, then insert a catalogue row that must survive adoption.
      const legacyUrl = databaseUrl(target.connectionString, legacyName);
      const legacyClient = new Client({ connectionString: legacyUrl });
      await legacyClient.connect();
      try {
        const [initial] = await loadMigrations();
        assert.ok(initial);
        for (const statement of initial.statements) {
          await legacyClient.query(statement);
        }
        await legacyClient.query(
          "INSERT INTO categories (slug, name) VALUES ('legacy-category', 'Legacy category')",
        );
        await legacyClient.query(
          `INSERT INTO products
            (slug, name, description, price_cents, category_id, stock)
           SELECT 'legacy-product', 'Legacy product', 'preserved', 2500, id, 8
           FROM categories WHERE slug = 'legacy-category'`,
        );
      } finally {
        await legacyClient.end();
      }

      await assert.rejects(
        migratePostgres({ connectionString: legacyUrl }),
        /--adopt-existing/,
      );
      const upgraded = await migratePostgres({
        connectionString: legacyUrl,
        adoptExisting: true,
      });
      assert.deepEqual(upgraded.adopted, ["0000_init"]);
      assert.deepEqual(upgraded.applied, [
        "0001_evora-digital",
        "0002_authentication",
      ]);

      const upgradedClient = new Client({ connectionString: legacyUrl });
      await upgradedClient.connect();
      try {
        const preserved = await upgradedClient.query<{
          name: string;
          stock: number;
          name_ar: string;
        }>(
          "SELECT name, stock, name_ar FROM products WHERE slug = 'legacy-product'",
        );
        assert.deepEqual(preserved.rows[0], {
          name: "Legacy product",
          stock: 8,
          name_ar: "",
        });
        const auth = await upgradedClient.query<{ present: string | null }>(
          "SELECT to_regclass('public.users')::text AS present",
        );
        assert.equal(auth.rows[0]?.present, "users");
      } finally {
        await upgradedClient.end();
      }
    } finally {
      await dropDatabase(admin, freshName);
      await dropDatabase(admin, legacyName);
      await admin.end();
    }
  },
);
