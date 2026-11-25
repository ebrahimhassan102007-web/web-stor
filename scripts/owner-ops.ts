/**
 * E-Vora owner operations — **local, CLI-only administration**.
 *
 *   npm run ops -- inspect --limit 20
 *   npm run ops -- bans list [--all]
 *   npm run ops -- bans add --ip 203.0.113.7 --hours 24
 *   npm run ops -- bans add --event <threat-event-uuid> --hours 24
 *   npm run ops -- bans lift --id <ban-uuid> | --ip 203.0.113.7 | --ended
 *   npm run ops -- bans account <email> [--hours 24]
 *   npm run ops -- promo list
 *   npm run ops -- promo create --code SPRING --type percentage --value 15 \
 *        [--min-subtotal 0] [--max-discount 5000] [--per-user 2] [--public] [--activate]
 *   npm run ops -- promo toggle <code> on|off
 *   npm run ops -- orders list [--status paid] [--limit 10]
 *   npm run ops -- orders show <orderNumber>
 *   npm run ops -- orders refund <orderNumber> [--reason "customer request"] [--dry-run]
 *   npm run ops -- cleanup [--dry-run] [--limit 500]
 *
 * S-25 removed the web admin UI completely: `/admin` answers `404` to
 * everyone, and administration happens here, on a machine that can reach the
 * database. This file is never imported by `src/app/**` and refuses to run
 * inside a web request.
 *
 * Safety rules baked in:
 *  - read-only unless the sub-command explicitly writes;
 *  - every write is idempotent or bounded (a refund is keyed by the order, a
 *    cleanup pass is limited per table);
 *  - no email, token or password is ever printed;
 *  - a refund never deletes anything: it credits the wallet through the ledger
 *    (`credit_refund`) and marks the order cancelled.
 */
import "dotenv/config";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/lib/db/schema";
import { resolveDatabaseUrl } from "../src/lib/db/config";
import { runEphemeralHygiene } from "../src/lib/db/hygiene";
import { banKeyForIp } from "../src/lib/security/threat-actor";
import type { BanSnapshot } from "../src/lib/security/threat-policy";
import { normalizePromoCode } from "../src/lib/wallet-math";

type Args = {
  command: string;
  rest: string[];
  flags: Map<string, string | true>;
};

const SUPPORTED_STATUSES = ["paid", "fulfilled", "completed"] as const;

function parseArgs(argv: string[]): Args {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const name = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(name, next);
      index += 1;
    } else {
      flags.set(name, true);
    }
  }
  const [command = "help", ...rest] = positionals;
  return { command, rest, flags };
}

function flagString(args: Args, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function flagNumber(args: Args, name: string, fallback: number): number {
  const raw = flagString(args, name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`--${name} must be a number`);
  return parsed;
}

function hasFlag(args: Args, name: string): boolean {
  return args.flags.has(name);
}

function requireString(args: Args, name: string): string {
  const value = flagString(args, name);
  if (!value) throw new Error(`Missing required --${name}`);
  return value;
}

function table(rows: Array<Record<string, string | number | boolean | null>>): void {
  if (rows.length === 0) {
    console.log("  (no rows)");
    return;
  }
  const columns = Object.keys(rows[0]!);
  const widths = columns.map((column) =>
    Math.max(
      column.length,
      ...rows.map((row) => String(row[column] ?? "").length),
    ),
  );
  const line = (cells: string[]) =>
    cells.map((cell, index) => cell.padEnd(widths[index]!)).join("  ");
  console.log("  " + line(columns));
  console.log("  " + widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) {
    console.log("  " + line(columns.map((column) => String(row[column] ?? ""))));
  }
}

function iso(value: Date | null): string {
  return value ? value.toISOString().replace(".000Z", "Z") : "-";
}

/** Refuse to run anywhere but a local terminal. */
function assertCliContext(): void {
  if (typeof window !== "undefined") {
    throw new Error("owner-ops is CLI-only and must never run in a browser.");
  }
  if (process.env.NEXT_RUNTIME) {
    throw new Error(
      "owner-ops is CLI-only. It must never be imported by the web application (NEXT_RUNTIME is set).",
    );
  }
}

async function main(): Promise<void> {
  assertCliContext();
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "help" || hasFlag(args, "help")) {
    console.log(
      [
        "E-Vora owner operations (local CLI only)",
        "",
        "  inspect   [--limit 20]                     recent audit, threat and ban activity",
        "  bans      list [--all]                     active bans (or every ban)",
        "  bans      add --ip <addr>|--event <uuid> [--hours 24] [--permanent]",
        "  bans      lift --id <uuid>|--ip <addr>|--ended",
        "  bans      account <email> [--hours 24]     suspend an account: revoke sessions + ban actors",
        "  promo     list | create ... | toggle <code> on|off",
        "  orders    list [--status paid] [--limit 10] | show <orderNumber>",
        "  orders    refund <orderNumber> [--reason ...] [--dry-run]",
        "  cleanup   [--dry-run] [--limit 500]        bounded ephemeral-state purge",
      ].join("\n"),
    );
    return;
  }

  // Reading the URL validates it (and never echoes credentials).
  const connectionString = resolveDatabaseUrl();
  const pool = new Pool({ connectionString, max: 2 });
  const db = drizzle({ client: pool, schema });

  try {
    switch (args.command) {
      case "inspect":
        await inspect(db, args);
        break;
      case "bans":
        await bans(db, args);
        break;
      case "promo":
        await promo(db, args);
        break;
      case "orders":
        await orders(db, args);
        break;
      case "cleanup":
        await cleanup(db, args);
        break;
      default:
        throw new Error(`Unknown command: ${args.command} (run \`npm run ops\` for help)`);
    }
  } finally {
    await pool.end();
  }
}

type OpsDb = ReturnType<typeof drizzle<typeof schema>>;

/* ------------------------------------------------------------------ */
/* inspect                                                            */
/* ------------------------------------------------------------------ */

async function inspect(db: OpsDb, args: Args): Promise<void> {
  const limit = Math.min(Math.max(flagNumber(args, "limit", 20), 1), 200);

  console.log("\nRecent security audit events");
  table(
    (
      await db
        .select({
          at: schema.securityAuditLog.createdAt,
          event: schema.securityAuditLog.event,
          detail: schema.securityAuditLog.detail,
        })
        .from(schema.securityAuditLog)
        .orderBy(desc(schema.securityAuditLog.createdAt))
        .limit(limit)
    ).map((row) => ({ at: iso(row.at), event: row.event, detail: row.detail })),
  );

  console.log("\nRecent threat events");
  table(
    (
      await db
        .select({
          at: schema.securityThreatEvents.occurredAt,
          signal: schema.securityThreatEvents.signal,
          tier: schema.securityThreatEvents.tier,
          actorKind: schema.securityThreatEvents.actorKind,
          path: schema.securityThreatEvents.path,
          method: schema.securityThreatEvents.method,
        })
        .from(schema.securityThreatEvents)
        .orderBy(desc(schema.securityThreatEvents.occurredAt))
        .limit(limit)
    ).map((row) => ({
      at: iso(row.at),
      signal: row.signal,
      tier: row.tier,
      actor: row.actorKind,
      request: `${row.method} ${row.path}`,
    })),
  );

  console.log("\nCurrent bans");
  await listBans(db, limit, false);
}

/* ------------------------------------------------------------------ */
/* bans                                                               */
/* ------------------------------------------------------------------ */

async function listBans(db: OpsDb, limit: number, all: boolean): Promise<void> {
  const now = new Date();
  const rows = await db
    .select()
    .from(schema.securityBans)
    .where(
      all
        ? undefined
        : and(
            eq(schema.securityBans.active, true),
            or(
              eq(schema.securityBans.permanent, true),
              sql`${schema.securityBans.expiresAt} > ${now}`,
            ),
          ),
    )
    .orderBy(desc(schema.securityBans.lastStrikeAt))
    .limit(limit);

  table(
    rows.map((row) => ({
      id: row.id,
      kind: row.actorKind,
      tier: row.tier,
      strikes: row.strikes,
      permanent: row.permanent,
      expires: row.permanent ? "never" : iso(row.expiresAt),
      active: row.active,
      signal: row.signal,
    })),
  );
}

async function bans(db: OpsDb, args: Args): Promise<void> {
  const [sub = "list", ...rest] = args.rest;

  if (sub === "list") {
    await listBans(db, Math.min(Math.max(flagNumber(args, "limit", 50), 1), 500), hasFlag(args, "all"));
    return;
  }

  if (sub === "add") {
    const now = new Date();
    const hours = flagNumber(args, "hours", 24);
    const permanent = hasFlag(args, "permanent");
    if (permanent && hours !== 24) {
      throw new Error("Use either --permanent or --hours, not both.");
    }

    let actorKey: string;
    let actorKind: "ip" | "fingerprint";
    const ip = flagString(args, "ip");
    const eventId = flagString(args, "event");

    if (ip) {
      actorKey = banKeyForIp(ip.trim());
      actorKind = "ip";
    } else if (eventId) {
      const [event] = await db
        .select({
          actorKey: schema.securityThreatEvents.actorKey,
          actorKind: schema.securityThreatEvents.actorKind,
        })
        .from(schema.securityThreatEvents)
        .where(eq(schema.securityThreatEvents.id, eventId))
        .limit(1);
      if (!event?.actorKey) {
        throw new Error(
          "That threat event has no attributable actor (no trusted IP and no usable fingerprint), so it cannot be banned.",
        );
      }
      actorKey = event.actorKey;
      actorKind = event.actorKind === "ip" ? "ip" : "fingerprint";
    } else {
      throw new Error("bans add needs --ip <address> or --event <threat-event-id>.");
    }

    const [existing] = await db
      .select()
      .from(schema.securityBans)
      .where(eq(schema.securityBans.actorKey, actorKey))
      .limit(1);

    const previous: BanSnapshot | null = existing
      ? {
          strikes: existing.strikes,
          tier: existing.tier === 1 ? 1 : 2,
          permanent: existing.permanent,
          active: existing.active,
          liftedAtMs: existing.liftedAt ? existing.liftedAt.getTime() : null,
          lastStrikeAtMs: existing.lastStrikeAt.getTime(),
          expiresAtMs: existing.expiresAt ? existing.expiresAt.getTime() : null,
        }
      : null;

    // An owner ban is always tier 1 (a deliberate decision, not a heuristic),
    // and never depends on the automatic escalation ladder.
    const expiresAt = permanent ? null : new Date(now.getTime() + hours * 60 * 60 * 1000);
    const values = {
      actorKey,
      actorKind,
      tier: 1 as const,
      signal: existing?.signal ?? "scanner_path",
      strikes: (previous?.strikes ?? 0) + 1,
      permanent,
      active: true,
      lastStrikeAt: now,
      expiresAt,
      liftedAt: null,
    };

    if (existing) {
      await db.update(schema.securityBans).set(values).where(eq(schema.securityBans.id, existing.id));
    } else {
      await db.insert(schema.securityBans).values({ ...values, startsAt: now });
    }

    await db.insert(schema.securityAuditLog).values({
      event: "owner_ban_created",
      detail: `${actorKind} ban ${permanent ? "permanent" : `${hours}h`}`,
    });
    console.log(
      `Banned ${actorKind} actor ${actorKey.slice(0, 12)}… ${permanent ? "permanently" : `for ${hours}h`} (expires ${iso(expiresAt)}).`,
    );
    return;
  }

  if (sub === "lift") {
    const now = new Date();
    let condition;
    const id = flagString(args, "id");
    const ip = flagString(args, "ip");
    if (id) condition = eq(schema.securityBans.id, id);
    else if (ip) condition = eq(schema.securityBans.actorKey, banKeyForIp(ip.trim()));
    else if (hasFlag(args, "ended")) {
      condition = or(
        and(
          isNull(schema.securityBans.liftedAt),
          sql`${schema.securityBans.expiresAt} IS NOT NULL`,
          sql`${schema.securityBans.expiresAt} <= ${now}`,
        ),
      );
    } else {
      throw new Error("bans lift needs --id <uuid>, --ip <address> or --ended.");
    }

    const lifted = await db
      .update(schema.securityBans)
      .set({ active: false, liftedAt: now })
      .where(condition)
      .returning({ id: schema.securityBans.id });
    await db.insert(schema.securityAuditLog).values({
      event: "owner_ban_lifted",
      detail: `${lifted.length} ban(s) lifted`,
    });
    console.log(`Lifted ${lifted.length} ban(s).`);
    return;
  }

  if (sub === "account") {
    const email = (rest[0] ?? flagString(args, "email"))?.trim().toLowerCase();
    if (!email) throw new Error("bans account <email>");
    const hours = flagNumber(args, "hours", 24);

    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    if (!user) throw new Error("No such account.");

    // Revoke every session for the account (the only account-level lever that
    // is enforced on every request), then ban the actors that account used.
    const revoked = await db
      .delete(schema.accountSessions)
      .where(eq(schema.accountSessions.userId, user.id))
      .returning({ id: schema.accountSessions.id });

    const actorKeys = new Set<string>();
    const events = await db
      .select({ actorKey: schema.securityThreatEvents.actorKey })
      .from(schema.securityThreatEvents)
      .where(eq(schema.securityThreatEvents.userId, user.id))
      .orderBy(desc(schema.securityThreatEvents.occurredAt))
      .limit(20);
    for (const event of events) if (event.actorKey) actorKeys.add(event.actorKey);

    if (actorKeys.size > 0) {
      const now = new Date();
      await db
        .update(schema.securityBans)
        .set({
          active: true,
          permanent: false,
          expiresAt: new Date(now.getTime() + hours * 60 * 60 * 1000),
          lastStrikeAt: now,
          liftedAt: null,
          tier: 1,
        })
        .where(inArray(schema.securityBans.actorKey, [...actorKeys]));
    }

    await db.insert(schema.securityAuditLog).values({
      event: "owner_account_suspended",
      userId: user.id,
      detail: `${revoked.length} session(s) revoked, ${actorKeys.size} actor(s) banned ${hours}h`,
    });
    console.log(
      `Account suspended: ${revoked.length} session(s) revoked, ${actorKeys.size} actor(s) banned for ${hours}h.`,
    );
    return;
  }

  throw new Error("Unknown bans sub-command (list|add|lift|account).");
}

/* ------------------------------------------------------------------ */
/* promo                                                              */
/* ------------------------------------------------------------------ */

async function promo(db: OpsDb, args: Args): Promise<void> {
  const [sub = "list"] = args.rest;

  if (sub === "list") {
    const rows = await db
      .select({
        code: schema.promoCodes.code,
        type: schema.promoCodes.discountType,
        value: schema.promoCodes.discountValue,
        active: schema.promoCodes.isActive,
        public: schema.promoCodes.isPublic,
        max: schema.promoCodes.maxRedemptions,
        perUser: schema.promoCodes.perUserLimit,
        expires: schema.promoCodes.expiresAt,
      })
      .from(schema.promoCodes)
      .orderBy(desc(schema.promoCodes.createdAt))
      .limit(200);
    table(rows.map((row) => ({ ...row, expires: iso(row.expires) })));
    return;
  }

  if (sub === "create") {
    const code = normalizePromoCode(requireString(args, "code"));
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
      throw new Error("Promo code must be 3–32 characters of A–Z, 0–9, _ or -.");
    }
    const type = requireString(args, "type");
    if (type !== "percentage" && type !== "fixed_cents") {
      throw new Error("--type must be percentage or fixed_cents.");
    }
    const value = flagNumber(args, "value", 0);
    if (value <= 0) throw new Error("--value must be positive.");
    if (type === "percentage" && value > 10_000) {
      throw new Error("percentage --value is in basis points (100 = 1%); at most 10000.");
    }

    const days = flagNumber(args, "days", 30);
    const now = new Date();
    const [created] = await db
      .insert(schema.promoCodes)
      .values({
        code,
        description: flagString(args, "description") ?? `Owner promo ${code}`,
        discountType: type,
        discountValue: value,
        minSubtotalCents: flagNumber(args, "min-subtotal", 0),
        maxDiscountCents: args.flags.has("max-discount") ? flagNumber(args, "max-discount", 0) : null,
        maxRedemptions: args.flags.has("max") ? flagNumber(args, "max", 0) : null,
        perUserLimit: flagNumber(args, "per-user", 1),
        startsAt: now,
        expiresAt: new Date(now.getTime() + days * 24 * 60 * 60 * 1000),
        isActive: hasFlag(args, "activate"),
        isPublic: hasFlag(args, "public"),
      })
      .onConflictDoNothing({ target: schema.promoCodes.code })
      .returning({ code: schema.promoCodes.code, active: schema.promoCodes.isActive });

    if (!created) throw new Error(`Promo ${code} already exists.`);
    await db.insert(schema.securityAuditLog).values({
      event: "owner_promo_created",
      detail: `${code} ${type} ${value} active=${created.active}`,
    });
    console.log(
      `Created ${created.code} (${type} ${value}) — inactive by default${created.active ? ", activated" : ""}.`,
    );
    return;
  }

  if (sub === "toggle") {
    const code = normalizePromoCode(args.rest[1] ?? "");
    const state = (args.rest[2] ?? "").toLowerCase();
    if (!code || (state !== "on" && state !== "off")) {
      throw new Error("promo toggle <code> on|off");
    }
    const [updated] = await db
      .update(schema.promoCodes)
      .set({ isActive: state === "on" })
      .where(eq(schema.promoCodes.code, code))
      .returning({ code: schema.promoCodes.code, active: schema.promoCodes.isActive });
    if (!updated) throw new Error("No such promo code.");
    await db.insert(schema.securityAuditLog).values({
      event: "owner_promo_toggled",
      detail: `${code} -> ${state}`,
    });
    console.log(`${updated.code} is now ${updated.active ? "active" : "inactive"}.`);
    return;
  }

  throw new Error("Unknown promo sub-command (list|create|toggle).");
}

/* ------------------------------------------------------------------ */
/* orders                                                             */
/* ------------------------------------------------------------------ */

async function orders(db: OpsDb, args: Args): Promise<void> {
  const [sub = "list", ...rest] = args.rest;

  if (sub === "list") {
    const limit = Math.min(Math.max(flagNumber(args, "limit", 10), 1), 200);
    const status = flagString(args, "status");
    const rows = await db
      .select({
        orderNumber: schema.orders.orderNumber,
        status: schema.orders.status,
        totalCents: schema.orders.totalCents,
        discountCents: schema.orders.discountCents,
        createdAt: schema.orders.createdAt,
      })
      .from(schema.orders)
      .where(status ? eq(schema.orders.status, status) : undefined)
      .orderBy(desc(schema.orders.createdAt))
      .limit(limit);
    table(rows.map((row) => ({ ...row, createdAt: iso(row.createdAt) })));
    return;
  }

  if (sub === "show") {
    const orderNumber = rest[0];
    if (!orderNumber) throw new Error("orders show <orderNumber>");
    const [order] = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.orderNumber, orderNumber))
      .limit(1);
    if (!order) throw new Error("No such order.");

    console.log(
      [
        `Order ${order.orderNumber}  status=${order.status}  total=${order.totalCents}c  discount=${order.discountCents}c`,
        `Created ${iso(order.createdAt)}`,
        `Customer ${order.customerName} <${order.email}>`,
      ].join("\n"),
    );
    table(
      (
        await db
          .select({
            product: schema.orderItems.productName,
            qty: schema.orderItems.quantity,
            unit: schema.orderItems.unitPriceCents,
          })
          .from(schema.orderItems)
          .where(eq(schema.orderItems.orderId, order.id))
      ).map((row) => ({ ...row, line: `${row.qty} x ${row.unit}c` })),
    );
    table(
      (
        await db
          .select({
            at: schema.walletLedger.createdAt,
            type: schema.walletLedger.entryType,
            direction: schema.walletLedger.direction,
            amount: schema.walletLedger.amountCents,
          })
          .from(schema.walletLedger)
          .where(eq(schema.walletLedger.orderId, order.id))
          .orderBy(desc(schema.walletLedger.createdAt))
      ).map((row) => ({ ...row, at: iso(row.at) })),
    );
    return;
  }

  if (sub === "refund") {
    const orderNumber = rest[0];
    if (!orderNumber) throw new Error("orders refund <orderNumber>");
    const dryRun = hasFlag(args, "dry-run");
    const reason = (flagString(args, "reason") ?? "owner refund").slice(0, 120);

    const [order] = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.orderNumber, orderNumber))
      .limit(1);
    if (!order) throw new Error("No such order.");

    const [existing] = await db
      .select({ id: schema.walletLedger.id })
      .from(schema.walletLedger)
      .where(eq(schema.walletLedger.idempotencyKey, `refund:${order.id}`))
      .limit(1);
    if (existing) {
      console.log(`Order ${order.orderNumber} was already refunded (ledger ${existing.id}). Nothing to do.`);
      return;
    }

    const refundable = SUPPORTED_STATUSES.includes(
      order.status as (typeof SUPPORTED_STATUSES)[number],
    );
    if (!refundable) {
      throw new Error(
        `Order status "${order.status}" is not refundable. Only paid/fulfilled/completed orders are.`,
      );
    }
    if (!order.userId) {
      throw new Error(
        "This order has no account, so there is no wallet to credit. Refund it at the payment provider instead.",
      );
    }
    if (order.totalCents <= 0) {
      throw new Error("Order total is not positive; nothing to refund.");
    }

    console.log(
      `Refunding ${order.orderNumber}: ${order.totalCents}c to the wallet of the order's owner.`,
    );
    if (dryRun) {
      console.log("Dry run: no rows written.");
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .insert(schema.walletAccounts)
        .values({ userId: order.userId!, balanceCents: 0 })
        .onConflictDoNothing();
      await tx
        .select({ userId: schema.walletAccounts.userId })
        .from(schema.walletAccounts)
        .where(eq(schema.walletAccounts.userId, order.userId!))
        .for("update")
        .limit(1);

      const [entry] = await tx
        .insert(schema.walletLedger)
        .values({
          userId: order.userId!,
          entryType: "credit_refund",
          direction: "credit",
          amountCents: order.totalCents,
          currency: "USD",
          orderId: order.id,
          idempotencyKey: `refund:${order.id}`,
          description: reason,
        })
        .onConflictDoNothing({ target: schema.walletLedger.idempotencyKey })
        .returning({ id: schema.walletLedger.id });
      if (!entry) return; // Concurrent refund won the race.

      await tx
        .update(schema.walletAccounts)
        .set({
          balanceCents: sql`${schema.walletAccounts.balanceCents} + ${order.totalCents as number}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.walletAccounts.userId, order.userId!));

      await tx
        .update(schema.orders)
        .set({ status: "cancelled" })
        .where(eq(schema.orders.id, order.id));

      await tx.insert(schema.securityAuditLog).values({
        event: "owner_refund_issued",
        userId: order.userId,
        detail: `${order.orderNumber} ${order.totalCents}c`,
      });
    });

    console.log(`Refunded. Ledger entry credit_refund recorded and the order is cancelled.`);
    return;
  }

  throw new Error("Unknown orders sub-command (list|show|refund).");
}

/* ------------------------------------------------------------------ */
/* cleanup                                                            */
/* ------------------------------------------------------------------ */

async function cleanup(db: OpsDb, args: Args): Promise<void> {
  const limit = Math.min(Math.max(flagNumber(args, "limit", 500), 1), 5000);
  if (hasFlag(args, "dry-run")) {
    const now = new Date();
    const counts = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.googleOAuthStates)
      .where(sql`${schema.googleOAuthStates.expiresAt} < ${now}`);
    console.log(`Dry run: ${counts[0]?.count ?? 0} expired OAuth state(s) would be removed (limit ${limit}).`);
    return;
  }

  const report = await runEphemeralHygiene({ database: db, maxRowsPerRun: limit });
  table([
    { target: "oauth_states", removed: report.oauthStates },
    { target: "password_reset_tokens", removed: report.passwordResetTokens },
    { target: "pending_2fa", removed: report.pendingTwoFactorChallenges },
    { target: "security_bans", removed: report.securityBans },
    { target: "abandoned_carts", removed: report.abandonedCarts },
    { target: "threat_events", removed: report.threatEvents },
    { target: "TOTAL", removed: report.total },
  ]);
}

main().catch((error: unknown) => {
  console.error(
    `owner-ops failed: ${error instanceof Error ? error.message : "unknown error"}`,
  );
  process.exitCode = 1;
});
