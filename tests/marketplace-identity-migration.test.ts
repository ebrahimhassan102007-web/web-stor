import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/lib/db/schema";
import { sellerProfiles, users } from "../src/lib/db/schema";
import {
  PLATFORM_SELLER_ID,
  PLATFORM_SELLER_SLUG,
  isPlatformSeller,
  isUuid,
} from "../src/lib/marketplace/platform-seller";

/**
 * Marketplace identity/approval migration (`0004_marketplace_identity`).
 *
 * Proves on a real PostgreSQL engine (PGlite) that the migration is additive,
 * that every new constraint actually bites, and that the single platform-owned
 * seller profile exists exactly once without being a login account.
 */

async function freshDatabase() {
  const client = new PGlite();
  const pgliteDb = drizzlePglite(client, { schema });
  await migrate(pgliteDb, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
  return {
    client,
    db: pgliteDb as unknown as NodePgDatabase<typeof schema>,
  };
}


/**
 * Drizzle wraps driver failures ("Failed query: …") and keeps the PostgreSQL
 * message on `cause`, so constraints are asserted across the whole error chain
 * rather than on the top-level message alone.
 */
async function expectDatabaseRejection(promise: Promise<unknown>, pattern: RegExp) {
  try {
    await promise;
  } catch (error) {
    const messages: string[] = [];
    let current: unknown = error;
    const seen = new Set<object>();
    while (current && typeof current === "object" && !seen.has(current)) {
      seen.add(current);
      const candidate = current as { message?: unknown; cause?: unknown };
      if (typeof candidate.message === "string") messages.push(candidate.message);
      current = candidate.cause;
    }
    assert.match(messages.join(" | "), pattern);
    return;
  }
  assert.fail(`expected the database to reject this write with ${String(pattern)}`);
}

test("0004 adds the marketplace identity tables without touching existing rows", async () => {
  const { client, db } = await freshDatabase();
  try {
    const { rows: tables } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    const names = tables.map((row) => row.tablename);
    for (const expected of [
      "seller_profiles",
      "seller_application_events",
      "marketplace_audit_events",
    ]) {
      assert.ok(names.includes(expected), `${expected} must exist`);
    }
    // Historic storefront + auth tables survive.
    for (const legacy of ["products", "orders", "order_items", "carts", "users"]) {
      assert.ok(names.includes(legacy), `${legacy} must survive`);
    }
    assert.equal(await db.$count(users), 0, "migration must not invent accounts");
  } finally {
    await client.close();
  }
});

test("the platform-owned seller profile is seeded once and is not a login", async () => {
  const { client, db } = await freshDatabase();
  try {
    const profiles = await db.select().from(sellerProfiles);
    assert.equal(profiles.length, 1);
    const platform = profiles[0];
    assert.ok(platform);
    assert.equal(platform.id, PLATFORM_SELLER_ID);
    assert.equal(platform.storeSlug, PLATFORM_SELLER_SLUG);
    assert.equal(platform.isPlatform, true);
    assert.equal(platform.userId, null);
    assert.equal(platform.status, "approved");
    assert.equal(isPlatformSeller(platform.id), true);
    assert.equal(isUuid(platform.id), true);
  } finally {
    await client.close();
  }
});

test("a second platform profile is impossible (partial unique index)", async () => {
  const { client, db } = await freshDatabase();
  try {
    await expectDatabaseRejection(
      db.insert(sellerProfiles).values({
        isPlatform: true,
        userId: null,
        storeName: "Rogue platform",
        storeSlug: "rogue-platform",
        phone: "",
        country: "EG",
        status: "approved",
        termsVersion: "platform-v1",
        approvedAt: new Date(),
      }),
      /seller_profiles_single_platform_idx|duplicate key/,
    );
  } finally {
    await client.close();
  }
});

test("new sellers default to pending and require terms acceptance", async () => {
  const { client, db } = await freshDatabase();
  try {
    const [account] = await db
      .insert(users)
      .values({ email: "applicant@example.test", displayName: "Applicant" })
      .returning({ id: users.id });

    // No terms acceptance → refused by the CHECK, not by application code.
    await expectDatabaseRejection(
      db.insert(sellerProfiles).values({
        userId: account.id,
        storeName: "No Terms Store",
        storeSlug: "no-terms-store",
        phone: "+201000000000",
        country: "EG",
      }),
      /seller_profiles_terms_for_real_sellers/,
    );

    const [created] = await db
      .insert(sellerProfiles)
      .values({
        userId: account.id,
        storeName: "Terms Store",
        storeSlug: "terms-store",
        phone: "+201000000000",
        country: "EG",
        termsAcceptedAt: new Date(),
        termsVersion: "seller-terms-v1",
      })
      .returning({ status: sellerProfiles.status });

    assert.equal(created.status, "pending", "new sellers must default to pending");
  } finally {
    await client.close();
  }
});

test("seller status, rejection reason and country checks are enforced by the database", async () => {
  const { client, db } = await freshDatabase();
  try {
    const [account] = await db
      .insert(users)
      .values({ email: "seller@example.test", displayName: "Seller" })
      .returning({ id: users.id });

    const base = {
      userId: account.id,
      phone: "+201000000000",
      termsAcceptedAt: new Date(),
      termsVersion: "seller-terms-v1",
    };

    // Unknown status.
    await expectDatabaseRejection(
      db.insert(sellerProfiles).values({
        ...base,
        storeName: "Bad Status",
        storeSlug: "bad-status",
        country: "EG",
        status: "approved-ish",
      }),
      /seller_profiles_status_known/,
    );

    // Rejected without a reason.
    await expectDatabaseRejection(
      db.insert(sellerProfiles).values({
        ...base,
        storeName: "No Reason",
        storeSlug: "no-reason",
        country: "EG",
        status: "rejected",
      }),
      /seller_profiles_rejection_reason_required/,
    );

    // Lowercase country code.
    await expectDatabaseRejection(
      db.insert(sellerProfiles).values({
        ...base,
        storeName: "Lower Case Country",
        storeSlug: "lower-country",
        country: "eg",
      }),
      /seller_profiles_country_uppercase/,
    );

    // Rejected WITH a reason is accepted.
    const [rejected] = await db
      .insert(sellerProfiles)
      .values({
        ...base,
        storeName: "Rejected Store",
        storeSlug: "rejected-store",
        country: "EG",
        status: "rejected",
        rejectionReason: "Incomplete business information",
      })
      .returning({ status: sellerProfiles.status });
    assert.equal(rejected.status, "rejected");
  } finally {
    await client.close();
  }
});

test("one account can own at most one seller profile", async () => {
  const { client, db } = await freshDatabase();
  try {
    const [account] = await db
      .insert(users)
      .values({ email: "dup@example.test", displayName: "Dup" })
      .returning({ id: users.id });
    const base = {
      userId: account.id,
      phone: "+201000000000",
      country: "EG",
      termsAcceptedAt: new Date(),
      termsVersion: "seller-terms-v1",
    };
    await db
      .insert(sellerProfiles)
      .values({ ...base, storeName: "First", storeSlug: "first-store" });
    await expectDatabaseRejection(
      db
        .insert(sellerProfiles)
        .values({ ...base, storeName: "Second", storeSlug: "second-store" }),
      /seller_profiles_user_idx/,
    );
  } finally {
    await client.close();
  }
});

test("the users role CHECK accepts seller while still rejecting unknown roles", async () => {
  const { client, db } = await freshDatabase();
  try {
    const [buyer] = await db
      .insert(users)
      .values({ email: "buyer@example.test", displayName: "Buyer" })
      .returning({ id: users.id, role: users.role });
    assert.equal(buyer.role, "customer", "buyers keep the existing customer role");

    await db
      .insert(users)
      .values({ email: "seller-role@example.test", displayName: "Seller", role: "seller" });

    await expectDatabaseRejection(
      db
        .insert(users)
        .values({ email: "admin-ish@example.test", displayName: "Sneaky", role: "superadmin" }),
      /users_role_known/,
    );
  } finally {
    await client.close();
  }
});

test("a seller profile cannot be deleted out from under its account or vice versa", async () => {
  const { client, db } = await freshDatabase();
  try {
    const [account] = await db
      .insert(users)
      .values({ email: "fk@example.test", displayName: "FK" })
      .returning({ id: users.id });
    await db.insert(sellerProfiles).values({
      userId: account.id,
      storeName: "FK Store",
      storeSlug: "fk-store",
      phone: "+201000000000",
      country: "EG",
      termsAcceptedAt: new Date(),
      termsVersion: "seller-terms-v1",
    });
    // ON DELETE RESTRICT: removing the account must fail while the profile exists.
    await expectDatabaseRejection(
      client.query("DELETE FROM users WHERE id = $1", [account.id]),
      /foreign key constraint/,
    );
  } finally {
    await client.close();
  }
});

test("migration 0004 is idempotent and keeps the catalogue intact", async () => {
  const { client, db } = await freshDatabase();
  try {
    const [category] = await client.query<{ id: number }>(
      "INSERT INTO categories (slug, name) VALUES ('test-cat', 'Test') RETURNING id",
    ).then((result) => result.rows);
    assert.ok(category);
    await client.query(
      "INSERT INTO products (slug, name, description, price_cents, category_id) VALUES ('test-product', 'Test product', 'desc', 12345, $1)",
      [category.id],
    );

    const before = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM products",
    );
    const platformBefore = await db.$count(sellerProfiles);

    // Re-running the whole history must be a no-op.
    await migrate(drizzlePglite(client, { schema }), {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });

    const after = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM products",
    );
    assert.equal(before.rows[0]?.count, after.rows[0]?.count);
    assert.equal(await db.$count(sellerProfiles), platformBefore, "platform seed must not duplicate");
  } finally {
    await client.close();
  }
});
