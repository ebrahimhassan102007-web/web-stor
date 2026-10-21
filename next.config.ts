import type { NextConfig } from "next";

/**
 * Hardened security headers.
 *
 * Note: the CSP allows 'unsafe-inline'/'unsafe-eval' for script in both
 * development and production because the Next.js runtime and hydration need
 * them. This is a compatibility policy, not a strict CSP; a tested nonce-based
 * policy is required before claiming stricter protection.
 */
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
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["*.e2b.app"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
