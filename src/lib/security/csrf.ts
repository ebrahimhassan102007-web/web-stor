import "server-only";
import type { NextRequest } from "next/server";

/**
 * CSRF defense-in-depth. Production must configure APP_ORIGIN to the exact
 * public origin (scheme + host); never use an untrusted forwarded-host value.
 */
export function verifySameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;

  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.protocol !== "https:" && parsedOrigin.protocol !== "http:") {
      return false;
    }

    const configuredOrigin = process.env.APP_ORIGIN;
    if (configuredOrigin) {
      const expected = new URL(configuredOrigin);
      if (
        expected.origin !== configuredOrigin.replace(/\/$/, "") ||
        (expected.protocol !== "https:" && expected.protocol !== "http:")
      ) return false;
      const requestHost = req.headers.get("host");
      return parsedOrigin.origin === expected.origin && requestHost?.toLowerCase() === expected.host.toLowerCase();
    }

    // Fail closed in production rather than trusting proxy forwarding headers.
    if (process.env.NODE_ENV === "production") return false;
    const host = req.headers.get("host");
    return Boolean(host && parsedOrigin.host === host);
  } catch {
    return false;
  }
}
