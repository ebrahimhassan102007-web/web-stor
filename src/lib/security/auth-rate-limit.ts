import "server-only";
import { createHmac, randomInt } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { db, authRateLimits } from "@/lib/db";
import {
  planAuthRateBuckets,
  type AuthRateBucketPlan,
  type AuthRatePolicy,
} from "@/lib/security/auth-rate-policy";
import { getAuthSecret } from "@/lib/security/auth-core";

export {
  FALLBACK_CLIENT_MULTIPLIER,
  planAuthRateBuckets,
  type AuthRateBucketPlan,
  type AuthRatePolicy,
} from "@/lib/security/auth-rate-policy";

function bucketDigest(scope: string, kind: AuthRateBucketPlan["kind"], value: string) {
  return createHmac("sha256", getAuthSecret())
    .update(`evora-auth-rate\0${scope}\0${kind}\0${value}`)
    .digest("hex");
}

async function takeBucket(
  keyHash: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
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
 * Persistent, atomic rate limits work across application instances. Keys are
 * HMACed before storage, and old buckets are opportunistically pruned.
 *
 * Every request must satisfy every planned bucket; when no trusted client IP
 * is configured the plan degrades to a coarse per-client fingerprint bucket
 * instead of disappearing (see `planAuthRateBuckets`).
 */
export async function enforceAuthRateLimit(
  request: Request,
  scope: string,
  email: string | undefined,
  policy: AuthRatePolicy,
): Promise<boolean> {
  const plans = planAuthRateBuckets({
    request,
    email,
    policy,
    trustProxyHeaders: process.env.TRUST_PROXY_IP_HEADERS === "true",
  });

  for (const plan of plans) {
    const digest = bucketDigest(scope, plan.kind, plan.value);
    if (!(await takeBucket(digest, plan.limit, policy.windowMs))) {
      return false;
    }
  }

  if (randomInt(0, 128) === 0) {
    const cleanupBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db
      .delete(authRateLimits)
      .where(lt(authRateLimits.windowStartedAt, cleanupBefore))
      .catch(() => {});
  }

  return true;
}

export function isAuthSecretConfigured(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    Boolean(process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32)
  );
}
