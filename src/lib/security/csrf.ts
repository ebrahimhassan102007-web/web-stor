import "server-only";
import type { NextRequest } from "next/server";

function normalizeConfiguredOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      (process.env.NODE_ENV === "production" && parsed.protocol !== "https:")
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Defense in depth for state-changing Route Handlers. Production origin is
 * pinned to APP_ORIGIN (not Host or X-Forwarded-Host); local development uses
 * the served host, including the trusted preview proxy headers. Missing or
 * malformed production configuration fails closed. SameSite=Lax cookies are
 * an additional CSRF defense.
 */
export function verifySameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;

  try {
    const supplied = new URL(origin);
    if (supplied.origin !== origin || supplied.username || supplied.password) {
      return false;
    }

    if (process.env.NODE_ENV === "production") {
      const expected = normalizeConfiguredOrigin(process.env.APP_ORIGIN);
      return Boolean(expected && supplied.origin === expected);
    }

    const servedHost =
      req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const forwardedProtocol = req.headers.get("x-forwarded-proto");
    const servedProtocol = forwardedProtocol
      ? `${forwardedProtocol.split(",")[0].trim()}:`
      : new URL(req.url).protocol;
    if (
      !servedHost ||
      servedHost.includes(",") ||
      servedHost.trim() !== servedHost ||
      !["http:", "https:"].includes(servedProtocol)
    ) {
      return false;
    }
    return supplied.host === servedHost && supplied.protocol === servedProtocol;
  } catch {
    return false;
  }
}
