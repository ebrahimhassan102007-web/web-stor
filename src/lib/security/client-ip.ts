import { isIP } from "node:net";

/**
 * Derives the rate-limit identity for a request.
 *
 * `X-Forwarded-For` is client-controlled unless a trusted proxy overwrites it,
 * so it is only consulted when `TRUST_PROXY_IP_HEADERS=true` is configured for
 * a deployment that actually strips client-supplied values. Otherwise every
 * request falls into one shared, conservative bucket — spoofing a header can
 * never buy extra quota.
 */
export const UNTRUSTED_PROXY_KEY = "untrusted-proxy";
export const UNKNOWN_CLIENT_KEY = "unknown-client";

export function getClientKey(req: Request, trustProxyHeaders: boolean): string {
  if (!trustProxyHeaders) return UNTRUSTED_PROXY_KEY;

  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (!first) return UNKNOWN_CLIENT_KEY;

  // Only accept a literal IP address so arbitrary strings cannot be used to
  // create unlimited buckets.
  return isIP(first) ? first : UNKNOWN_CLIENT_KEY;
}
