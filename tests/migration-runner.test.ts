import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/lib/db/schema";
import {
  loadMigrations,
  migrateDatabase,
  type MigrationClient,
} from "../src/lib/db/migrations";

function asMigrationClient(client: PGlite): MigrationClient {
  return client as unknown as MigrationClient;
}

async function applySqlHistory(client: PGlite, through: number): Promise<void> {
  const migrations = await loadMigrations();
  for (const migration of migrations.slice(0, through)) {
    for (const statement of migration.statements) {
      await client.query(statement);
    }
  }
}

async function tableNames(client: PGlite): Promise<string[]> {
  const result = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  return result.rows.map((row) => row.tablename);
}

test("fresh migration is explicit, complete, and idempotent", async () => {
  const client = new PGlite();
  try {
    const dryRun = await migrateDatabase({
      client: asMigrationClient(client),
      dryRun: true,
    });
    assert.deepEqual(
      dryRun.operations.map((operation) => operation.action),
      ["apply", "apply", "apply", "apply"],
    );
    assert.equal((await tableNames(client)).length, 0, "dry run must not create tables");

    const first = await migrateDatabase({ client: asMigrationClient(client) });
    assert.deepEqual(first.applied, [
      "0000_init",
      "0001_evora-digital",
      "0002_authentication",
      "0003_hardening",
    ]);
    assert.deepEqual(first.adopted, []);
    assert.deepEqual(await tableNames(client), [
      "account_sessions",
      "auth_rate_limits",
      "cart_items",
      "carts",
      "categories",
      "email_verification_codes",
      "google_oauth_states",
      "order_items",
      "orders",
      "products",
      "security_audit_log",
      "users",
    ]);

    await client.query(
      "INSERT INTO categories (slug, name) VALUES ('custom-category', 'Keep this category')",
    );
    const second = await migrateDatabase({ client: asMigrationClient(client) });
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.adopted, []);
    assert.equal(second.unchanged.length, 4);
    const preserved = await client.query<{ name: string }>(
      "SELECT name FROM categories WHERE slug = 'custom-category'",
    );
    assert.equal(preserved.rows[0]?.name, "Keep this category");
  } finally {
    await client.close();
  }
});

test("existing 0000 storefront is adopted without replaying CREATE TABLE and preserves catalogue data", async () => {
  const client = new PGlite();
  try {
    // Simulate the previous storefront: its initial schema exists, but there
    // is no Drizzle migration table or history yet.
    await applySqlHistory(client, 1);
    await client.query(
      "INSERT INTO categories (slug, name, description) VALUES ($1, $2, $3)",
      ["legacy-category", "Legacy category", "Existing catalogue data"],
    );
    await client.query(
      `INSERT INTO products
        (slug, name, description, price_cents, category_id, stock)
       SELECT $1, $2, $3, $4, id, $5 FROM categories WHERE slug = $6`,
      [
        "legacy-product",
        "Legacy product",
        "Do not lose this row",
        4599,
        12,
        "legacy-category",
      ],
    );

    await assert.rejects(
      migrateDatabase({ client: asMigrationClient(client) }),
      /--adopt-existing/,
    );
    const untouched = await client.query<{ name: string; stock: number }>(
      "SELECT name, stock FROM products WHERE slug = 'legacy-product'",
    );
    assert.deepEqual(untouched.rows[0], { name: "Legacy product", stock: 12 });

    const plan = await migrateDatabase({
      client: asMigrationClient(client),
      dryRun: true,
    });
    assert.deepEqual(
      plan.operations.map((operation) => operation.action),
      ["adopt", "apply", "apply", "apply"],
    );

    const migrated = await migrateDatabase({
      client: asMigrationClient(client),
      adoptExisting: true,
    });
    assert.deepEqual(migrated.adopted, ["0000_init"]);
    assert.deepEqual(migrated.applied, [
      "0001_evora-digital",
      "0002_authentication",
      "0003_hardening",
    ]);

    const preserved = await client.query<{
      name: string;
      stock: number;
      name_ar: string;
      input_type: string;
    }>(
      "SELECT name, stock, name_ar, input_type FROM products WHERE slug = 'legacy-product'",
    );
    assert.deepEqual(preserved.rows[0], {
      name: "Legacy product",
      stock: 12,
      name_ar: "",
      input_type: "none",
    });
    assert.ok((await tableNames(client)).includes("users"));

    const again = await migrateDatabase({
      client: asMigrationClient(client),
      adoptExisting: true,
    });
    assert.equal(again.operations.every((operation) => operation.action === "unchanged"), true);
  } finally {
    await client.close();
  }
});

test("an already-shaped but untracked schema requires adoption and never duplicates rows", async () => {
  const client = new PGlite();
  try {
    await applySqlHistory(client, 3);
    await client.query(
      "INSERT INTO categories (slug, name) VALUES ('keep-me', 'Keep me')",
    );
    await assert.rejects(
      migrateDatabase({ client: asMigrationClient(client) }),
      /--adopt-existing/,
    );
    const result = await migrateDatabase({
      client: asMigrationClient(client),
      adoptExisting: true,
    });
    // The three historical migrations are adopted; the new hardening
    // migration (no adoption requirement) applies normally on top.
    assert.deepEqual(result.applied, ["0003_hardening"]);
    assert.equal(result.adopted.length, 3);
    const count = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM categories WHERE slug = 'keep-me'",
    );
    assert.equal(count.rows[0]?.count, "1");
  } finally {
    await client.close();
  }
});

test("history written by the original Drizzle migrator is recognized without replay", async () => {
  const client = new PGlite();
  try {
    const database = drizzlePglite(client, { schema });
    await migratePglite(database, {
      migrationsFolder: `${process.cwd()}/drizzle`,
    });
    const result = await migrateDatabase({ client: asMigrationClient(client) });
    assert.equal(result.operations.every((operation) => operation.action === "unchanged"), true);
    assert.deepEqual(result.applied, []);
    assert.deepEqual(result.adopted, []);
  } finally {
    await client.close();
  }
});

test("unknown and partially migrated schemas fail before initialization", async () => {
  const unknown = new PGlite();
  try {
    await unknown.query("CREATE TABLE unrelated (id integer PRIMARY KEY)");
    await assert.rejects(
      migrateDatabase({ client: asMigrationClient(unknown), adoptExisting: true }),
      /non-empty public schema/,
    );
    assert.equal((await tableNames(unknown)).includes("categories"), false);
  } finally {
    await unknown.close();
  }

  const partial = new PGlite();
  try {
    await applySqlHistory(partial, 1);
    await partial.query("ALTER TABLE categories ADD COLUMN name_ar varchar(128) DEFAULT '' NOT NULL");
    await assert.rejects(
      migrateDatabase({ client: asMigrationClient(partial), adoptExisting: true }),
      /only part of its expected schema objects/,
    );
    const history = await partial.query<{ present: string | null }>(
      "SELECT to_regclass('drizzle.__drizzle_migrations')::text AS present",
    );
    assert.equal(history.rows[0]?.present, null);
  } finally {
    await partial.close();
  }
});
