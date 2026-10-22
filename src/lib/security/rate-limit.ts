import "server-only";
import { getClientKey } from "./client-ip";

/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * KNOWN LIMITATION — not a production boundary: the counter lives in this
 * process only, so multiple instances (or a restart) each keep their own
 * buckets. A multi-instance deployment needs a shared atomic limiter (Redis,
 * a database, or an edge/WAF rate-limiting service); configure that before
 * relying on these limits.
 */
type Window = { count: number; resetAt: number };

const buckets = new Map<string, Window>();
const MAX_BUCKETS = 10_000;

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      // Drop expired entries before accepting new keys.
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

/**
 * Rate-limit identity for a request.
 *
 * `X-Forwarded-For` is only honoured when `TRUST_PROXY_IP_HEADERS=true` marks
 * a deployment whose proxy overwrites that header. Otherwise forwarding
 * headers are ignored and all clients share one conservative bucket, so a
 * spoofed header cannot be used to dodge limits or to pin abuse on someone
 * else's address.
 */
export function clientKey(req: Request): string {
  return getClientKey(req, process.env.TRUST_PROXY_IP_HEADERS === "true");
}
