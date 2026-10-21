import type { NextConfig } from "next";

/**
 * Hardened security headers.
 *
 * The current CSP allows 'unsafe-inline' and 'unsafe-eval' in both development
 * and production. It is a compatibility policy, not a strict CSP. Do not claim
 * otherwise; test a nonce-based production policy before tightening it.
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
  // PGlite loads .wasm/data files relative to its package at runtime, so
  // keep it out of the bundler and let Node require() it directly.
  serverExternalPackages: ["@electric-sql/pglite"],
  allowedDevOrigins: ["*.e2b.app"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
