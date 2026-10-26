import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request nonce CSP (S-05) using the Next.js 16 proxy pattern
 * (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
 *
 * Production scripts require the nonce + `strict-dynamic`; there is no
 * `'unsafe-inline'`/`'unsafe-eval'` for scripts outside development.
 * Styles keep `'unsafe-inline'` because React/Tailwind emit style
 * attributes; script execution is the XSS-critical surface.
 * `x-nonce` is forwarded so server components can nonce their own scripts
 * if any are ever added.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

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

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);

  // Personal/authenticated pages must never be stored by any cache (S-06).
  const path = request.nextUrl.pathname;
  if (
    path.startsWith("/account") ||
    path.startsWith("/admin") ||
    path.startsWith("/login") ||
    path.startsWith("/checkout") ||
    path.startsWith("/cart")
  ) {
    response.headers.set("Cache-Control", "no-store");
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
