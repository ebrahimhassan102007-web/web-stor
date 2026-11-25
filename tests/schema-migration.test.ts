import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/lib/db/schema";
import { products } from "../src/lib/db/schema";
import { seedMissingCatalog } from "../src/lib/db/seed-catalog";
import { SEED_CATEGORIES, SEED_PRODUCTS } from "../src/lib/db/seed-data";

test("a clean embedded PostgreSQL database applies all migrations and additive seed safely", async () => {
  const client = new PGlite();
  try {
    const pgliteDb = drizzlePglite(client, { schema });
    const migrationsFolder = path.join(process.cwd(), "drizzle");
    await migrate(pgliteDb, { migrationsFolder });

    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    assert.deepEqual(
      rows.map((row) => row.tablename),
      [
        "account_sessions",
        "auth_rate_limits",
        "cart_items",
        "carts",
        "categories",
        "email_verification_codes",
        "fulfillment_vault",
        "google_oauth_states",
        "marketplace_audit_events",
        "order_items",
        "orders",
        "password_reset_tokens",
        "pending_two_factor_challenges",
        "products",
        "promo_codes",
        "promo_redemptions",
        "security_audit_log",
        "security_bans",
        "security_threat_events",
        "seller_application_events",
        "seller_profiles",
        "totp_recovery_codes",
        "user_totp",
        "users",
        "wallet_accounts",
        "wallet_ledger",
      ],
    );

    const database = pgliteDb as unknown as NodePgDatabase<typeof schema>;
    const first = await seedMissingCatalog(database);
    assert.deepEqual(first, {
      categoriesAdded: SEED_CATEGORIES.length,
      productsAdded: SEED_PRODUCTS.length,
    });

    const [original] = await database.select().from(products).limit(1);
    assert.ok(original);
    await database
      .update(products)
      .set({ name: "Existing row preserved", stock: 9 })
      .where(eq(products.id, original.id));

    const second = await seedMissingCatalog(database);
    assert.deepEqual(second, { categoriesAdded: 0, productsAdded: 0 });
    const [preserved] = await database
      .select()
      .from(products)
      .where(eq(products.id, original.id));
    assert.equal(preserved.name, "Existing row preserved");
    assert.equal(preserved.stock, 9);
  } finally {
    await client.close();
  }
});

test("wallet ledger credits are idempotent, balances never go negative, and entries are immutable", async () => {
  const client = new PGlite();
  try {
    await migrate(drizzlePglite(client, { schema }), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    const inserted = await client.query<{ id: string }>("INSERT INTO users (email, display_name) VALUES ('wallet-test@example.test', 'Wallet test') RETURNING id");
    const userId = inserted.rows[0]!.id;
    await client.query("INSERT INTO wallet_accounts (user_id, balance_cents) VALUES ($1, 0)", [userId]);
    const creditOnce = async () => client.query(
      `WITH entry AS (
         INSERT INTO wallet_ledger (user_id, entry_type, direction, amount_cents, currency, idempotency_key, description)
         VALUES ($1, 'credit_topup', 'credit', 500, 'USD', 'topup:event-one', 'Test credit')
         ON CONFLICT (idempotency_key) DO NOTHING RETURNING amount_cents
       )
       UPDATE wallet_accounts SET balance_cents = balance_cents + entry.amount_cents
       FROM entry WHERE wallet_accounts.user_id = $1 RETURNING wallet_accounts.balance_cents`, [userId]);
    assert.equal(((await creditOnce()).rows[0] as { balance_cents: number } | undefined)?.balance_cents, 500);
    assert.deepEqual((await creditOnce()).rows, [], "duplicate event must not apply a second credit");
    const insufficient = await client.query("UPDATE wallet_accounts SET balance_cents = balance_cents - 501 WHERE user_id = $1 AND balance_cents >= 501 RETURNING balance_cents", [userId]);
    assert.deepEqual(insufficient.rows, [], "insufficient debit leaves wallet unchanged");
    await assert.rejects(client.query("UPDATE wallet_ledger SET description = 'tampered' WHERE idempotency_key = 'topup:event-one'"), /immutable/);
    await assert.rejects(client.query("UPDATE wallet_accounts SET balance_cents = -1 WHERE user_id = $1", [userId]), /wallet_accounts_balance_cents_check/);
    const balance = await client.query<{ balance_cents: number }>("SELECT balance_cents FROM wallet_accounts WHERE user_id = $1", [userId]);
    assert.equal(balance.rows[0]?.balance_cents, 500);
  } finally { await client.close(); }
});
