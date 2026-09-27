import type { NextConfig } from "next";

/**
 * Hardened security headers.
 *
 * Note: the CSP allows 'unsafe-inline'/'unsafe-eval' for script because the
 * Next.js dev runtime and hydration require them. For a stricter production
 * posture, migrate to a nonce-based CSP emitted from proxy.ts.
 */
const isProd = process.env.NODE_ENV === "production" && !process.env.SANDBOX_PREVIEW;

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      // Clickjacking protection. Omitted outside production so the sandboxed
      // live-preview iframe keeps working during development.
      ...(isProd ? ["frame-ancestors 'none'"] : []),
    ].join("; "),
  },
  // HSTS only in production — it must never be sent over plain-HTTP dev.
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
        { key: "X-Frame-Options", value: "DENY" },
      ]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["*.e2b.app"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
