import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/lib/db/schema";
import { HYGIENE_POLICY, runEphemeralHygiene } from "../src/lib/db/hygiene";

/**
 * S-25 — ephemeral-state hygiene against a real PostgreSQL engine (PGlite).
 *
 * The purge must remove exactly the rows whose purpose has expired, and must
 * never touch accounts, live sessions, orders, the wallet ledger, promo codes
 * or the catalogue.
 */

const NOW = new Date("2026-11-25T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const ahead = (ms: number) => new Date(NOW.getTime() + ms);
const DAY = 24 * 60 * 60 * 1000;

async function count(client: PGlite, table: string): Promise<number> {
  const { rows } = await client.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM ${table}`,
  );
  return rows[0]?.count ?? -1;
}

test("S-25: hygiene purges only expired ephemeral state and preserves live data", async () => {
  const client = new PGlite();
  try {
    const pglite = drizzlePglite(client, { schema });
    await migrate(pglite, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    const database = pglite as unknown as NodePgDatabase<typeof schema>;

    // `password_reset_tokens` allows one row per user, so the four reset-token
    // fixtures live on four accounts.
    const users = await pglite
      .insert(schema.users)
      .values(
        Array.from({ length: 4 }, (_, index) => ({
          email: `hygiene${index}@example.com`,
          displayName: `Hygiene ${index}`,
          passwordHash: null,
        })),
      )
      .returning({ id: schema.users.id });
    const userId = users[0]!.id;

    // OAuth states: one long expired, one still valid.
    await pglite.insert(schema.googleOAuthStates).values([
      { stateHash: "a".repeat(64), nonce: "n1", codeVerifier: "v1", expiresAt: ago(5 * 60 * 1000) },
      { stateHash: "b".repeat(64), nonce: "n2", codeVerifier: "v2", expiresAt: ahead(5 * 60 * 1000) },
    ]);

    // Reset tokens: expired, consumed long ago, freshly consumed, still valid.
    await pglite.insert(schema.passwordResetTokens).values([
      { userId: users[0]!.id, tokenHash: "c".repeat(64), expiresAt: ago(8 * DAY) },
      { userId: users[1]!.id, tokenHash: "d".repeat(64), expiresAt: ahead(DAY), consumedAt: ago(8 * DAY) },
      { userId: users[2]!.id, tokenHash: "e".repeat(64), expiresAt: ahead(DAY), consumedAt: ago(60 * 1000) },
      { userId: users[3]!.id, tokenHash: "f".repeat(64), expiresAt: ahead(DAY) },
    ]);

    // Pending 2FA: expired two days ago, expired one minute ago, live.
    await pglite.insert(schema.pendingTwoFactorChallenges).values([
      { userId, tokenHash: "1".repeat(64), authMethod: "email", expiresAt: ago(2 * DAY) },
      { userId, tokenHash: "2".repeat(64), authMethod: "email", expiresAt: ago(60 * 1000) },
      { userId, tokenHash: "3".repeat(64), authMethod: "email", expiresAt: ahead(5 * 60 * 1000) },
    ]);

    // Bans: expired long ago, expired moments ago, active permanent, lifted long ago.
    const banBase = { actorKind: "ip", tier: 1, signal: "scanner_path", strikes: 1, active: true };
    await pglite.insert(schema.securityBans).values([
      { ...banBase, actorKey: `ip:${"a".repeat(64)}`, permanent: false, startsAt: ago(9 * DAY), lastStrikeAt: ago(9 * DAY), expiresAt: ago(8 * DAY) },
      { ...banBase, actorKey: `ip:${"b".repeat(64)}`, permanent: false, startsAt: ago(2 * DAY), lastStrikeAt: ago(2 * DAY), expiresAt: ago(60 * 1000) },
      { ...banBase, actorKey: `ip:${"c".repeat(64)}`, permanent: true, startsAt: ago(3 * DAY), lastStrikeAt: ago(3 * DAY), expiresAt: null },
      { ...banBase, actorKey: `ip:${"d".repeat(64)}`, permanent: false, startsAt: ago(40 * DAY), lastStrikeAt: ago(40 * DAY), expiresAt: ago(30 * DAY), active: false, liftedAt: ago(8 * DAY) },
    ]);

    // Carts: abandoned, and recently active.
    await pglite.insert(schema.carts).values([
      { createdAt: ago(60 * DAY), updatedAt: ago(31 * DAY) },
      { createdAt: ago(60 * DAY), updatedAt: ago(DAY) },
    ]);

    // Threat trail: old and fresh.
    await pglite.insert(schema.securityThreatEvents).values([
      { actorKind: "ip", actorKey: `ip:${"e".repeat(64)}`, signal: "scanner_path", tier: 1, occurredAt: ago(100 * DAY) },
      { actorKind: "ip", actorKey: `ip:${"f".repeat(64)}`, signal: "scanner_path", tier: 1, occurredAt: ago(DAY) },
    ]);

    // Unrelated business data the purge must never touch.
    const [order] = await pglite
      .insert(schema.orders)
      .values({
        orderNumber: "EV-HYGIENE-1",
        status: "paid",
        customerName: "Buyer",
        email: "buyer@example.com",
        addressLine1: "1 Street",
        city: "Alexandria",
        postalCode: "00000",
        country: "EG",
        subtotalCents: 500,
        shippingCents: 0,
        totalCents: 500,
        userId,
      })
      .returning({ id: schema.orders.id });
    await pglite.insert(schema.walletAccounts).values({ userId, balanceCents: 500 });
    await pglite.insert(schema.walletLedger).values({
      userId,
      entryType: "credit_topup",
      direction: "credit",
      amountCents: 500,
      currency: "USD",
      orderId: order!.id,
      idempotencyKey: "hygiene-topup-1",
    });
    await pglite.insert(schema.accountSessions).values({
      userId,
      tokenHash: "9".repeat(64),
      expiresAt: ahead(30 * DAY),
    });
    await pglite.insert(schema.promoCodes).values({
      code: "HYGIENE10",
      discountType: "percentage",
      discountValue: 1000,
      isActive: true,
      isPublic: false,
    });

    const before = {
      orders: await count(client, "orders"),
      walletAccounts: await count(client, "wallet_accounts"),
      walletLedger: await count(client, "wallet_ledger"),
      accountSessions: await count(client, "account_sessions"),
      promo: await count(client, "promo_codes"),
      users: await count(client, "users"),
    };

    const report = await runEphemeralHygiene({ database, now: NOW });

    assert.equal(report.oauthStates, 1, "only the expired OAuth state goes");
    assert.equal(report.passwordResetTokens, 2, "expired + long-consumed reset tokens go");
    assert.equal(report.pendingTwoFactorChallenges, 1, "only challenges past the grace window go");
    assert.equal(report.securityBans, 2, "expired and long-lifted bans go");
    assert.equal(report.abandonedCarts, 1, "only the 31-day-old cart goes");
    assert.equal(report.threatEvents, 1, "only trail older than retention goes");
    assert.equal(report.total, 8);

    // What survived is exactly what should have survived.
    assert.equal(await count(client, "google_oauth_states"), 1);
    assert.equal(await count(client, "password_reset_tokens"), 2);
    assert.equal(await count(client, "pending_two_factor_challenges"), 2);
    assert.equal(await count(client, "security_bans"), 2);
    assert.equal(await count(client, "carts"), 1);
    assert.equal(await count(client, "security_threat_events"), 1);

    const { rows: remainingBans } = await client.query<{ actor_key: string }>(
      "SELECT actor_key FROM security_bans ORDER BY actor_key",
    );
    assert.deepEqual(
      remainingBans.map((row) => row.actor_key),
      [`ip:${"b".repeat(64)}`, `ip:${"c".repeat(64)}`],
      "the active permanent ban and the just-expired ban are both kept",
    );

    // Business data is untouched.
    assert.deepEqual(
      {
        orders: await count(client, "orders"),
        walletAccounts: await count(client, "wallet_accounts"),
        walletLedger: await count(client, "wallet_ledger"),
        accountSessions: await count(client, "account_sessions"),
        promo: await count(client, "promo_codes"),
        users: await count(client, "users"),
      },
      before,
    );

    // A second run is a no-op (idempotent, bounded, no cascade surprises).
    const second = await runEphemeralHygiene({ database, now: NOW });
    assert.equal(second.total, 0);
  } finally {
    await client.close();
  }
});

test("S-25: every hygiene statement is bounded by a row limit", async () => {
  const client = new PGlite();
  try {
    const pglite = drizzlePglite(client, { schema });
    await migrate(pglite, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    const database = pglite as unknown as NodePgDatabase<typeof schema>;

    await pglite.insert(schema.googleOAuthStates).values(
      Array.from({ length: 7 }, (_, index) => ({
        stateHash: `${index}`.padStart(64, "0"),
        nonce: `n${index}`,
        codeVerifier: `v${index}`,
        expiresAt: ago(60 * 1000),
      })),
    );

    const limited = await runEphemeralHygiene({ database, now: NOW, maxRowsPerRun: 3 });
    assert.equal(limited.oauthStates, 3, "a run removes at most `maxRowsPerRun` rows per table");
    assert.equal(await count(client, "google_oauth_states"), 4);

    await pglite.delete(schema.googleOAuthStates).where(sql`1 = 1`);
    assert.equal(HYGIENE_POLICY.maxRowsPerRun, 500);
    assert.ok(HYGIENE_POLICY.minIntervalMs >= 60_000, "opportunistic runs are throttled");
  } finally {
    await client.close();
  }
});
