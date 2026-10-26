import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, authRateLimits } from "@/lib/db";
import { trustedClientIp } from "@/lib/security/client-ip";

/**
 * Rate limiting for cart/checkout (S-02/S-12).
 *
 * Primary store: the `auth_rate_limits` PostgreSQL table (atomic upsert,
 * shared across instances, survives restarts). If the database is briefly
 * unavailable we fall back to a bounded in-memory window so a DB blip does
 * not take the storefront down — the fallback is per-instance only.
 *
 * Keys are never one global bucket: callers pass per-client, per-cart and
 * per-account keys, and EVERY key must be within its limit. Without trusted
 * proxy headers we key by a coarse client fingerprint (see `clientKey`)
 * instead of the old single shared `untrusted-proxy` bucket that let one
 * attacker exhaust everyone's quota.
 */
type Window = { count: number; resetAt: number };

const buckets = new Map<string, Window>();
const MAX_BUCKETS = 10_000;

/** In-memory fallback (also used by unit tests). Returns true = allowed. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      for (const [k, v] of buckets) {
        if (v.resetAt <= now) buckets.delete(k);
      }
      if (buckets.size >= MAX_BUCKETS) return false;
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

function bucketHash(scope: string, key: string): string {
  return createHash("sha256").update(`evora-rate\0${scope}\0${key}`).digest("hex");
}

async function takeDbBucket(keyHash: string, limit: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowMs);
  const [row] = await db
    .insert(authRateLimits)
    .values({ keyHash, windowStartedAt: now, count: 1 })
    .onConflictDoUpdate({
      target: authRateLimits.keyHash,
      set: {
        count: sql`CASE WHEN ${authRateLimits.windowStartedAt} <= ${cutoff} THEN 1 ELSE ${authRateLimits.count} + 1 END`,
        windowStartedAt: sql`CASE WHEN ${authRateLimits.windowStartedAt} <= ${cutoff} THEN ${now} ELSE ${authRateLimits.windowStartedAt} END`,
      },
    })
    .returning({ count: authRateLimits.count });
  return Boolean(row && row.count <= limit);
}

/**
 * DB-backed multi-key limiter. All keys must pass. Falls back to the
 * in-memory limiter if the database write fails (availability), still
 * keyed per key — never a single shared bucket.
 */
export async function enforceRateLimit(
  scope: string,
  keys: readonly string[],
  limit: number,
  windowMs: number,
): Promise<boolean> {
  for (const key of keys) {
    let allowed: boolean;
    try {
      allowed = await takeDbBucket(bucketHash(scope, key), limit, windowMs);
    } catch {
      allowed = rateLimit(`${scope}:${key}`, limit, windowMs);
    }
    if (!allowed) return false;
  }
  return true;
}

/**
 * Per-client key. With trusted proxy headers this is the real client IP
 * (counted from the right of X-Forwarded-For — see client-ip.ts). Without
 * them we use a coarse fingerprint of stable client headers so distinct
 * visitors no longer share one exhaustible bucket. The fingerprint is a
 * rate-limit key only, never an identity/authentication signal.
 */
export function clientKey(req: Request): string {
  const ip = trustedClientIp(req, process.env.TRUST_PROXY_IP_HEADERS === "true");
  if (ip) return `ip:${ip}`;
  const fingerprintSource = [
    req.headers.get("user-agent") ?? "",
    req.headers.get("accept-language") ?? "",
    req.headers.get("sec-ch-ua") ?? "",
  ].join("\0");
  const digest = createHash("sha256").update(fingerprintSource).digest("hex").slice(0, 32);
  return `fp:${digest}`;
}
