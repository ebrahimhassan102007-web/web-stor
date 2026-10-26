import { isIP } from "node:net";

/**
 * Trusted client-IP resolution (S-02/S-03).
 *
 * Forwarding headers are only honored when the deployment opts in with
 * `TRUST_PROXY_IP_HEADERS=true`, meaning its reverse proxy writes
 * `X-Forwarded-For` itself. Even then the FIRST entry is never trusted:
 * proxies append, so everything except the entries written by our own
 * trusted hops is attacker-controlled. We therefore count from the RIGHT:
 * with `TRUSTED_PROXY_HOPS=1` (one proxy in front of the app) the client IP
 * is the last entry — the address our proxy actually connected from.
 */
export const UNTRUSTED_PROXY_KEY = "untrusted-proxy";

/** Normalize an IP literal: lowercase, unwrap IPv4-mapped IPv6, validate. */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim().toLowerCase();
  if (!value || value.length > 64) return null;
  // Strip brackets / zone id that some proxies include for IPv6 literals.
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
  const zone = value.indexOf("%");
  if (zone !== -1) value = value.slice(0, zone);
  // IPv4-mapped / compatible IPv6 → plain IPv4 so buckets don't split.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (mapped) value = mapped[1];
  return isIP(value) ? value : null;
}

/** Parse the configured trusted hop count (1..10, default 1). */
export function trustedProxyHops(
  env: { readonly TRUSTED_PROXY_HOPS?: string | undefined },
): number {
  const parsed = Number.parseInt(env.TRUSTED_PROXY_HOPS ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 10);
}

export function trustedClientIp(
  request: Request,
  trustProxyHeaders: boolean,
  hops?: number,
): string | null {
  hops ??= trustedProxyHops(process.env as { TRUSTED_PROXY_HOPS?: string });
  if (!trustProxyHeaders) return null;
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const entries = forwarded
    .split(",")
    .map((part) => normalizeIp(part))
    .filter((part): part is string => part !== null);
  if (entries.length === 0) return null;
  // Entries to the left of our trusted hops may be spoofed by the client.
  // With N trusted hops, the rightmost N-1 entries are our own proxies and
  // the entry just left of them is the real client. If the chain is shorter
  // than the configured hops, fall back to the leftmost entry we have.
  const index = Math.max(0, entries.length - hops);
  return entries[index];
}
