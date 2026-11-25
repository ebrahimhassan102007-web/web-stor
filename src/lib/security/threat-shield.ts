import "server-only";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db, securityBans, securityThreatEvents } from "@/lib/db";
import type * as schemaTypes from "@/lib/db/schema";
import { resolveThreatActor, type ThreatActor } from "@/lib/security/threat-actor";
import {
  looksLikeOrdinaryBrowser,
  planBanStrike,
  shouldEnforceBan,
  signalTier,
  type ActorKind,
  type BanSnapshot,
  type ThreatSignal,
} from "@/lib/security/threat-policy";

/**
 * Threat-shield persistence layer (S-25).
 *
 * The rules live in `threat-policy.ts`; this module only resolves an actor
 * identity, writes the event trail and applies the ban plan.
 *
 * Actor identity is deliberately narrow:
 *  - a **trusted** client IP (`TRUST_PROXY_IP_HEADERS=true`), or
 *  - a salted header fingerprint, and only when the request actually carried
 *    distinguishing headers, or
 *  - nothing at all — in which case no ban is created. A request we cannot
 *    attribute must never be able to ban a shared bucket of other visitors.
 *
 * Keys are HMACed with `AUTH_SECRET`, so no raw address, cookie or token is
 * ever stored. Rotation of the secret invalidates stored keys, which is the
 * intended behaviour (bans are operational data, not identity).
 */
export type ShieldDatabase = NodePgDatabase<typeof schemaTypes>;
export { resolveThreatActor, type ThreatActor } from "@/lib/security/threat-actor";

function truncate(value: string | null | undefined, max: number): string {
  if (!value) return "";
  return value.slice(0, max);
}

export function requestPath(request: Request): string {
  try {
    return truncate(new URL(request.url).pathname, 256);
  } catch {
    return "";
  }
}

async function readBanRow(
  database: ShieldDatabase,
  actorKey: string,
): Promise<schemaTypes.SecurityBan | null> {
  const [row] = await database
    .select()
    .from(securityBans)
    .where(eq(securityBans.actorKey, actorKey))
    .limit(1);
  return row ?? null;
}

function toSnapshot(row: schemaTypes.SecurityBan | null): BanSnapshot | null {
  if (!row) return null;
  return {
    strikes: row.strikes,
    tier: row.tier === 1 ? 1 : 2,
    permanent: row.permanent,
    active: row.active,
    liftedAtMs: row.liftedAt ? row.liftedAt.getTime() : null,
    lastStrikeAtMs: row.lastStrikeAt.getTime(),
    expiresAtMs: row.expiresAt ? row.expiresAt.getTime() : null,
  };
}

async function persistBan(
  database: ShieldDatabase,
  actorKey: string,
  actorKind: Exclude<ActorKind, "unknown">,
  previous: schemaTypes.SecurityBan | null,
  plan: ReturnType<typeof planBanStrike>,
): Promise<schemaTypes.SecurityBan | null> {
  const expiresAt = plan.expiresAtMs === null ? null : new Date(plan.expiresAtMs);
  const lastStrikeAt = new Date(plan.lastStrikeAtMs);

  if (previous) {
    const [updated] = await database
      .update(securityBans)
      .set({
        tier: plan.tier,
        signal: plan.signal,
        strikes: plan.strikes,
        permanent: plan.permanent,
        active: true,
        liftedAt: null,
        lastStrikeAt,
        expiresAt,
      })
      .where(eq(securityBans.id, previous.id))
      .returning();
    return updated ?? null;
  }

  const [inserted] = await database
    .insert(securityBans)
    .values({
      actorKey,
      actorKind,
      tier: plan.tier,
      signal: plan.signal,
      strikes: plan.strikes,
      permanent: plan.permanent,
      active: true,
      startsAt: lastStrikeAt,
      lastStrikeAt,
      expiresAt,
    })
    .onConflictDoNothing({ target: securityBans.actorKey })
    .returning();
  if (inserted) return inserted;

  // Lost a race against a concurrent strike: re-read and extend.
  const existing = await readBanRow(database, actorKey);
  if (!existing) return null;
  return persistBan(database, actorKey, actorKind, existing, plan);
}

/**
 * Write-amplification guard.
 *
 * Scanner traffic is unauthenticated and unbounded, so an attacker could
 * otherwise force two database writes per probe. The same actor is recorded at
 * most once per window; the ban itself is already in place and every response
 * is identical, so nothing observable changes.
 */
const RECORD_THROTTLE_MS = 15_000;
const MAX_THROTTLE_ENTRIES = 5_000;

const globalForThreatWrites = globalThis as unknown as {
  __evoraThreatWrites?: Map<string, number>;
};

function throttleAllows(key: string, nowMs: number): boolean {
  const writes = (globalForThreatWrites.__evoraThreatWrites ??= new Map());
  const last = writes.get(key) ?? 0;
  if (nowMs - last < RECORD_THROTTLE_MS) return false;
  if (writes.size >= MAX_THROTTLE_ENTRIES) {
    for (const [entry, at] of writes) {
      if (nowMs - at > RECORD_THROTTLE_MS) writes.delete(entry);
    }
    if (writes.size >= MAX_THROTTLE_ENTRIES) return false;
  }
  writes.set(key, nowMs);
  return true;
}

export type ThreatReceipt = {
  actor: ThreatActor;
  signal: ThreatSignal;
  recorded: boolean;
  /** True when the write-amplification window suppressed this repeat. */
  throttled: boolean;
  banned: boolean;
  permanent: boolean;
  expiresAt: Date | null;
  strikes: number;
};

/**
 * Record a signal and (when the actor is attributable) apply the ban plan.
 *
 * Never throws: a threat record is best-effort telemetry + hardening, and a
 * database problem must not turn a denied request into a crashed one.
 */
export async function recordThreat(
  request: Request,
  signal: ThreatSignal,
  options?: {
    detail?: string;
    userId?: string | null;
    database?: ShieldDatabase;
    now?: Date;
  },
): Promise<ThreatReceipt> {
  const database = options?.database ?? db;
  const now = options?.now ?? new Date();
  const actor = resolveThreatActor(request);
  const base: ThreatReceipt = {
    actor,
    signal,
    recorded: false,
    throttled: false,
    banned: false,
    permanent: false,
    expiresAt: null,
    strikes: 0,
  };

  if (!throttleAllows(actor.key ?? "unknown", now.getTime())) {
    // The actor is already recorded/banned from the earlier hit; the response
    // the caller sends is identical either way.
    return { ...base, throttled: true };
  }

  try {
    await database.insert(securityThreatEvents).values({
      actorKind: actor.kind,
      actorKey: actor.key,
      userId: options?.userId ?? null,
      signal,
      tier: signalTier(signal),
      path: requestPath(request),
      method: truncate(request.method, 8),
      detail: truncate(options?.detail, 160) || truncate(actor.ip, 160),
      occurredAt: now,
    });
    base.recorded = true;
  } catch {
    // Telemetry only; keep going so the ban is still applied.
  }

  if (!actor.key) return base;

  try {
    const previous = await readBanRow(database, actor.key);
    const plan = planBanStrike(toSnapshot(previous), {
      tier: signalTier(signal),
      signal,
      actorKind: actor.kind === "ip" ? "ip" : "fingerprint",
      nowMs: now.getTime(),
    });
    const saved = await persistBan(
      database,
      actor.key,
      actor.kind === "ip" ? "ip" : "fingerprint",
      previous,
      plan,
    );
    return {
      ...base,
      banned: true,
      permanent: saved?.permanent ?? plan.permanent,
      expiresAt: saved?.expiresAt ?? (plan.expiresAtMs === null ? null : new Date(plan.expiresAtMs)),
      strikes: saved?.strikes ?? plan.strikes,
    };
  } catch {
    // A failed write must not change the caller's response.
    return base;
  }
}

/** The active ban for this request's actor, if any. */
export async function activeBanForRequest(
  request: Request,
  database: ShieldDatabase = db,
  now: Date = new Date(),
): Promise<schemaTypes.SecurityBan | null> {
  const actor = resolveThreatActor(request);
  if (!actor.key) return null;
  const [row] = await database
    .select()
    .from(securityBans)
    .where(
      and(
        eq(securityBans.actorKey, actor.key),
        eq(securityBans.active, true),
        isNull(securityBans.liftedAt),
        or(eq(securityBans.permanent, true), gt(securityBans.expiresAt, now)),
      ),
    )
    .limit(1);
  if (!row) return null;
  const enforced = shouldEnforceBan(
    {
      actorKind: row.actorKind,
      strikes: row.strikes,
      active: row.active,
      permanent: row.permanent,
      liftedAtMs: row.liftedAt ? row.liftedAt.getTime() : null,
      expiresAtMs: row.expiresAt ? row.expiresAt.getTime() : null,
    },
    { requestLooksLikeBrowser: looksLikeOrdinaryBrowser(request.headers), nowMs: now.getTime() },
  );
  return enforced ? row : null;
}
