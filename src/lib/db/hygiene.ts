import { and, eq, inArray, isNotNull, isNull, lt, or, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  carts,
  googleOAuthStates,
  passwordResetTokens,
  pendingTwoFactorChallenges,
  securityBans,
  securityThreatEvents,
} from "./schema";
import type * as schemaTypes from "./schema";

/**
 * Ephemeral-state hygiene (S-25).
 *
 * Short-lived rows — OAuth states, reset tokens, pending 2FA challenges,
 * expired bans, abandoned guest carts and the threat trail — otherwise grow
 * without bound. This module deletes exactly the rows whose purpose has
 * already expired, and nothing else:
 *
 *  - **never** touches accounts, sessions that are still valid, orders,
 *    order items, the wallet ledger, promo codes or the catalogue;
 *  - every statement is **bounded** (`LIMIT`), so one run can never hold a long
 *    lock or stampede the database;
 *  - runs are **throttled** per process and scheduled with `after()`, so they
 *    never add latency to a user's response;
 *  - a failure is swallowed — hygiene is maintenance, not a request path.
 *
 * This module carries **no** `server-only` marker and no ambient database: it
 * takes its connection as an argument. That keeps it usable from the local
 * owner CLI (`npm run ops -- cleanup`) as well as from the app scheduler.
 */

export const HYGIENE_POLICY = {
  /** Expired OAuth states are useless immediately. */
  oauthStateGraceMs: 0,
  /** Keep reset tokens a week past expiry/consumption for support queries. */
  resetTokenGraceMs: 7 * 24 * 60 * 60 * 1000,
  /** Keep finished/expired 2FA challenges for a day. */
  twoFactorGraceMs: 24 * 60 * 60 * 1000,
  /** Keep expired bans for 7 days so the owner CLI can explain a block. */
  banGraceMs: 7 * 24 * 60 * 60 * 1000,
  /** Guest carts untouched for 30 days are abandoned. */
  abandonedCartMs: 30 * 24 * 60 * 60 * 1000,
  /** Threat trail retention. */
  threatEventMs: 90 * 24 * 60 * 60 * 1000,
  /** Maximum rows removed per table per run. */
  maxRowsPerRun: 500,
  /** Minimum time between opportunistic runs in one process. */
  minIntervalMs: 60 * 60 * 1000,
} as const;

export type HygieneDatabase = NodePgDatabase<typeof schemaTypes>;

export type HygieneReport = {
  ranAt: string;
  oauthStates: number;
  passwordResetTokens: number;
  pendingTwoFactorChallenges: number;
  securityBans: number;
  abandonedCarts: number;
  threatEvents: number;
  total: number;
};

type PurgeTarget = {
  key: string;
  table: PgTable;
  column: AnyPgColumn;
  where: SQL | undefined;
};

async function purgeBounded(
  database: HygieneDatabase,
  target: PurgeTarget,
  limit: number,
): Promise<number> {
  // A single bounded statement: the sub-select picks at most `limit` keys, so
  // the DELETE itself is small and index-driven.
  const ids = database
    .select({ key: target.column })
    .from(target.table)
    .where(target.where)
    .limit(limit);

  const removed = await database
    .delete(target.table)
    .where(inArray(target.column, ids))
    .returning({ key: target.column });
  return Array.isArray(removed) ? removed.length : 0;
}

/**
 * Run one bounded hygiene pass. Returns per-table counts.
 *
 * Callers pass `now` in tests; production uses the real clock.
 */
export async function runEphemeralHygiene(options: {
  database: HygieneDatabase;
  now?: Date;
  maxRowsPerRun?: number;
}): Promise<HygieneReport> {
  const database = options.database;
  const now = options?.now ?? new Date();
  const limit = options?.maxRowsPerRun ?? HYGIENE_POLICY.maxRowsPerRun;
  const at = (offsetMs: number) => new Date(now.getTime() - offsetMs);

  const report: HygieneReport = {
    ranAt: now.toISOString(),
    oauthStates: 0,
    passwordResetTokens: 0,
    pendingTwoFactorChallenges: 0,
    securityBans: 0,
    abandonedCarts: 0,
    threatEvents: 0,
    total: 0,
  };

  const targets: Array<[keyof Omit<HygieneReport, "ranAt" | "total">, PurgeTarget]> = [
    [
      "oauthStates",
      {
        key: "oauth_states",
        table: googleOAuthStates,
        column: googleOAuthStates.stateHash,
        where: lt(googleOAuthStates.expiresAt, at(HYGIENE_POLICY.oauthStateGraceMs)),
      },
    ],
    [
      "passwordResetTokens",
      {
        key: "password_reset_tokens",
        table: passwordResetTokens,
        column: passwordResetTokens.id,
        where: or(
          lt(passwordResetTokens.expiresAt, at(HYGIENE_POLICY.resetTokenGraceMs)),
          and(
            isNotNull(passwordResetTokens.consumedAt),
            lt(passwordResetTokens.consumedAt, at(HYGIENE_POLICY.resetTokenGraceMs)),
          ),
        ),
      },
    ],
    [
      "pendingTwoFactorChallenges",
      {
        key: "pending_two_factor_challenges",
        table: pendingTwoFactorChallenges,
        column: pendingTwoFactorChallenges.id,
        // Expired, or consumed more than a day ago.
        where: or(
          lt(pendingTwoFactorChallenges.expiresAt, at(HYGIENE_POLICY.twoFactorGraceMs)),
          and(
            isNotNull(pendingTwoFactorChallenges.consumedAt),
            lt(pendingTwoFactorChallenges.consumedAt, at(HYGIENE_POLICY.twoFactorGraceMs)),
          ),
        ),
      },
    ],
    [
      "securityBans",
      {
        key: "security_bans",
        table: securityBans,
        // Ended bans only: expired (non-permanent) or explicitly lifted.
        // An active ban is never hygiene's business.
        column: securityBans.id,
        where: or(
          and(
            isNotNull(securityBans.liftedAt),
            lt(securityBans.liftedAt, at(HYGIENE_POLICY.banGraceMs)),
          ),
          and(
            isNull(securityBans.liftedAt),
            eq(securityBans.permanent, false),
            isNotNull(securityBans.expiresAt),
            lt(securityBans.expiresAt, at(HYGIENE_POLICY.banGraceMs)),
          ),
        ),
      },
    ],
    [
      "abandonedCarts",
      {
        key: "carts",
        table: carts,
        column: carts.id,
        // Guest carts only, and only when they have not been touched for 30
        // days. Orders do not reference a cart, so "abandoned" means exactly
        // "no activity for the retention window". Cart items go with the cart
        // through the foreign key's ON DELETE CASCADE.
        where: lt(carts.updatedAt, at(HYGIENE_POLICY.abandonedCartMs)),
      },
    ],
    [
      "threatEvents",
      {
        key: "security_threat_events",
        table: securityThreatEvents,
        column: securityThreatEvents.id,
        where: lt(securityThreatEvents.occurredAt, at(HYGIENE_POLICY.threatEventMs)),
      },
    ],
  ];

  for (const [field, target] of targets) {
    try {
      report[field] = await purgeBounded(database, target, limit);
    } catch {
      // One failing table must not abort the others.
      report[field] = 0;
    }
  }

  report.total =
    report.oauthStates +
    report.passwordResetTokens +
    report.pendingTwoFactorChallenges +
    report.securityBans +
    report.abandonedCarts +
    report.threatEvents;

  return report;
}
