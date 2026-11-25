import { NextResponse, type NextRequest } from "next/server";
import { classifyRequestPath } from "@/lib/security/threat-policy";
import { recordThreat } from "@/lib/security/threat-shield";

/**
 * Per-request nonce CSP (S-05) using the Next.js 16 proxy pattern.
 *
 * Production scripts require the nonce + `strict-dynamic`; there is no
 * `'unsafe-inline'`/`'unsafe-eval'` for scripts outside development.
 * Styles keep `'unsafe-inline'` because React/Tailwind emit style
 * attributes; script execution is the XSS-critical surface.
 * `x-nonce` is forwarded so server components can nonce their own scripts
 * if any are ever added.
 *
 * S-25 adds two hard edges in front of the application:
 *
 *  - `/admin` and everything under it are **gone**: an unconditional `404`
 *    with `private, no-store`, for anonymous and authenticated visitors alike.
 *    Administration is local-only (`npm run ops`).
 *  - Scanner/exploit families (`/.env`, `/.git`, `/wp-admin`, `/phpmyadmin`,
 *    `/cgi-bin`, `/actuator`, `/wp-login.php`, …) are a tier-1 signal: the
 *    actor is recorded and banned, and the answer is a bare `404`.
 *
 * Proxy always runs on the Node.js runtime in Next.js 16, and the recording
 * helper never throws, so a database problem degrades to "still 404".
 */
const NO_STORE = "private, no-store, no-cache, must-revalidate";

function securityHeaders(nonce: string, isDev: boolean): Record<string, string> {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
  return {
    "Content-Security-Policy": csp,
    "Cache-Control": NO_STORE,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
  };
}

/** A response that reveals nothing: no markup, no route hints, no caching. */
function hiddenNotFound(nonce: string, isDev: boolean): NextResponse {
  return new NextResponse(null, {
    status: 404,
    headers: securityHeaders(nonce, isDev),
  });
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const path = request.nextUrl.pathname;

  const verdict = classifyRequestPath(path);
  if (verdict.action !== "allow") {
    if (verdict.action === "trap") {
      // Tier 1: record + ban. Never throws, never changes the 404.
      await recordThreat(request, "scanner_path", { detail: verdict.family });
    }
    return hiddenNotFound(nonce, isDev);
  }

  const csp = securityHeaders(nonce, isDev)["Content-Security-Policy"];
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);

  // Personal/authenticated pages must never be stored by any cache (S-06).
  const privatePrefixes = ["/account", "/login", "/checkout", "/cart", "/seller"];
  if (privatePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    response.headers.set("Cache-Control", NO_STORE);
    response.headers.set("Vary", "Cookie");
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
