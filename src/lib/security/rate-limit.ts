import "server-only";
import { getClientKey } from "./client-ip";

/**
 * Minimal in-memory sliding-window rate limiter. Best-effort on one process.
 * Multi-instance production requires a shared atomic store (e.g. Redis or an
 * edge rate-limiting service); do not treat this map as a production boundary.
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
 * Only use X-Forwarded-For when deployment configuration confirms that a
 * trusted edge proxy overwrites that header. Otherwise every client shares a
 * conservative fallback bucket; client-supplied forwarding values are ignored.
 */
export function clientKey(req: Request): string {
  return getClientKey(req, process.env.TRUST_PROXY_IP_HEADERS === "true");
}
