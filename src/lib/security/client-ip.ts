import { isIP } from "node:net";

/**
 * Forwarded client IPs are only trusted when the deployment's reverse proxy
 * strips client-supplied forwarding headers and writes its own value.
 */
export const UNTRUSTED_PROXY_KEY = "untrusted-proxy";

export function trustedClientIp(
  request: Request,
  trustProxyHeaders: boolean,
): string | null {
  if (!trustProxyHeaders) return null;
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && isIP(first) ? first : null;
}
