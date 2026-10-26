#!/usr/bin/env node
/**
 * Automated security-header scanner (S-06). Usage:
 *   node scripts/scan-headers.mjs [baseUrl]   (default http://localhost:3000)
 * Exits non-zero when a required header is missing or the CSP is unsafe.
 * Only ever point this at a local instance you started yourself.
 */
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const required = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "x-permitted-cross-domain-policies": "none",
  "referrer-policy": "strict-origin-when-cross-origin",
};
let failures = 0;
for (const path of ["/", "/login", "/account", "/products"]) {
  const res = await fetch(base + path, { redirect: "manual" });
  console.log(`\n== ${path} -> ${res.status}`);
  for (const [name, expected] of Object.entries(required)) {
    const actual = res.headers.get(name);
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${actual ?? "(missing)"}`);
  }
  const csp = res.headers.get("content-security-policy") ?? "";
  const checks = [
    ["csp has nonce", /'nonce-[A-Za-z0-9+/=]+'/.test(csp)],
    ["csp strict-dynamic", csp.includes("'strict-dynamic'")],
    ["csp frame-ancestors none", csp.includes("frame-ancestors 'none'")],
    ["csp object-src none", csp.includes("object-src 'none'")],
    ["no script unsafe-inline", !/script-src[^;]*'unsafe-inline'/.test(csp)],
    ...(process.env.NODE_ENV === "production"
      ? [["no unsafe-eval (prod)", !csp.includes("'unsafe-eval'")]]
      : []),
    ...(path.startsWith("/account") || path.startsWith("/login")
      ? [["cache-control no-store", (res.headers.get("cache-control") ?? "").includes("no-store")]]
      : []),
  ];
  for (const [label, ok] of checks) {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  }
}
console.log(failures === 0 ? "\nALL HEADER CHECKS PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
