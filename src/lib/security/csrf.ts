import "server-only";
import type { NextRequest } from "next/server";
import { getAuthSecret } from "@/lib/security/auth-core";
import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/security/csrf-constants";
import { verifyDoubleSubmitCsrf } from "@/lib/security/csrf-token";

export { CSRF_COOKIE, CSRF_HEADER };

function normalizeConfiguredOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (
      parsed.username || parsed.password || parsed.pathname !== "/" ||
      parsed.search || parsed.hash ||
      (process.env.NODE_ENV === "production" && parsed.protocol !== "https:")
    ) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/** Origin validation and a signed double-submit token are both required for every mutation. */
export function verifySameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const supplied = new URL(origin);
    if (supplied.origin !== origin || supplied.username || supplied.password) return false;
    let originValid = false;
    if (process.env.NODE_ENV === "production") {
      const expected = normalizeConfiguredOrigin(process.env.APP_ORIGIN);
      originValid = Boolean(expected && supplied.origin === expected);
    } else {
      const requestUrl = new URL(req.url);
      const trustForwarded = process.env.TRUST_PROXY_IP_HEADERS === "true";
      const servedHost = trustForwarded
        ? (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))
        : requestUrl.host;
      const forwarded = trustForwarded ? req.headers.get("x-forwarded-proto") : null;
      const servedProtocol = forwarded ? `${forwarded.split(",")[0]!.trim()}:` : requestUrl.protocol;
      originValid = Boolean(
        servedHost && !servedHost.includes(",") && servedHost.trim() === servedHost &&
        ["http:", "https:"].includes(servedProtocol) &&
        supplied.host === servedHost && supplied.protocol === servedProtocol,
      );
    }
    if (!originValid) return false;
    return verifyDoubleSubmitCsrf(
      req.cookies.get(CSRF_COOKIE)?.value,
      req.headers.get(CSRF_HEADER),
      getAuthSecret(),
    );
  } catch {
    return false;
  }
}
