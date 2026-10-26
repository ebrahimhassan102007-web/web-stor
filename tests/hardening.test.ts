import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeIp, trustedClientIp, trustedProxyHops } from "../src/lib/security/client-ip";
import { planGoogleLink } from "../src/lib/security/google-link";
import { readJsonBody } from "../src/lib/security/read-json";
import { validateEnv } from "../src/lib/env";
import { isSessionLive, SESSION_IDLE_MS } from "../src/lib/security/account-session-policy";

function reqWithXff(xff: string) {
  return new Request("http://localhost/", { headers: { "x-forwarded-for": xff } });
}

test("S-03: X-Forwarded-For is counted from the right; spoofed first entries are ignored", () => {
  // One trusted proxy: attacker prepends a fake IP; the proxy appends the real one.
  assert.equal(trustedClientIp(reqWithXff("9.9.9.9, 203.0.113.7"), true, 1), "203.0.113.7");
  // Two trusted hops: client, proxy1 (proxy2 is the direct peer).
  assert.equal(trustedClientIp(reqWithXff("198.51.100.3, 10.0.0.1"), true, 2), "198.51.100.3");
  // Untrusted deployment: header ignored entirely.
  assert.equal(trustedClientIp(reqWithXff("203.0.113.7"), false), null);
  // Garbage entries are dropped, valid ones normalized.
  assert.equal(trustedClientIp(reqWithXff("nonsense, ::FFFF:203.0.113.9"), true, 1), "203.0.113.9");
  assert.equal(normalizeIp("[2001:DB8::1%25eth0]"), "2001:db8::1");
  assert.equal(normalizeIp("not-an-ip"), null);
  assert.equal(trustedProxyHops({ TRUSTED_PROXY_HOPS: "3" }), 3);
  assert.equal(trustedProxyHops({ TRUSTED_PROXY_HOPS: "bogus" }), 1);
});

test("S-01: linking Google to an unverified password account clears the password, codes and sessions", () => {
  const plan = planGoogleLink(
    { googleSub: null, emailVerifiedAt: null, hasPasswordHash: true },
    "google-sub-1",
  );
  assert.deepEqual(plan, {
    action: "link",
    clearPasswordHash: true,
    deleteVerificationCodes: true,
    revokeAllSessions: true,
  });

  const verified = planGoogleLink(
    { googleSub: null, emailVerifiedAt: new Date(), hasPasswordHash: true },
    "google-sub-1",
  );
  assert.deepEqual(verified, {
    action: "link",
    clearPasswordHash: false,
    deleteVerificationCodes: false,
    revokeAllSessions: true,
  });

  const mismatch = planGoogleLink(
    { googleSub: "someone-else", emailVerifiedAt: new Date(), hasPasswordHash: false },
    "google-sub-1",
  );
  assert.equal(mismatch.action, "reject");
});

test("S-01: the Google callback applies the linking plan in both branches", () => {
  const route = readFileSync("src/app/api/auth/google/callback/route.ts", "utf8");
  assert.match(route, /planGoogleLink/);
  assert.match(route, /delete\(emailVerificationCodes\)/);
  assert.match(route, /delete\(accountSessions\)/);
  assert.match(route, /passwordHash: null/);
  // Both the existing-row and raced-row paths go through applyGoogleLink.
  assert.equal(route.match(/applyGoogleLink\(tx/g)?.length, 2);
});

test("S-07: bounded JSON reader enforces content-type and byte caps (incl. chunked)", async () => {
  const wrongType = new Request("http://localhost/", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "{}",
  });
  assert.deepEqual(await readJsonBody(wrongType, 1024), { ok: false, reason: "unsupported-media" });

  const big = new Request("http://localhost/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pad: "x".repeat(5000) }),
  });
  assert.deepEqual(await readJsonBody(big, 1024), { ok: false, reason: "too-large" });

  // Chunked/streamed body with no content-length must still be capped.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (let i = 0; i < 10; i++) controller.enqueue(enc.encode("x".repeat(400)));
      controller.close();
    },
  });
  const chunked = new Request("http://localhost/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    // @ts-expect-error duplex is required by undici for streamed bodies
    duplex: "half",
  });
  assert.deepEqual(await readJsonBody(chunked, 1024), { ok: false, reason: "too-large" });

  const good = new Request("http://localhost/", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ a: 1 }),
  });
  const parsed = await readJsonBody(good, 1024);
  assert.equal(parsed.ok, true);
});

test("S-07: every state-changing commerce route uses the bounded reader, none uses req.json()", () => {
  for (const file of [
    "src/app/api/cart/items/route.ts",
    "src/app/api/cart/items/[id]/route.ts",
    "src/app/api/checkout/route.ts",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /readJsonBody\(req/, file);
    assert.doesNotMatch(source, /req\.json\(\)/, file);
  }
});

test("S-08: order history and checkout are keyed by session user id, never typed email", () => {
  const ordersPage = readFileSync("src/app/account/orders/page.tsx", "utf8");
  assert.match(ordersPage, /eq\(orders\.userId, user\.id\)/);
  assert.doesNotMatch(ordersPage, /eq\(orders\.email, user\.email\)/);
  const checkout = readFileSync("src/app/api/checkout/route.ts", "utf8");
  assert.match(checkout, /getCurrentAccountUser/);
  assert.match(checkout, /userId: accountUser\?\.id/);
});

test("S-09: session idle timeout kills sessions inside their absolute TTL", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  const fresh = { expiresAt: new Date(now.getTime() + 6 * 86400e3), lastUsedAt: now };
  assert.equal(isSessionLive(fresh, now), true);
  const idle = {
    expiresAt: new Date(now.getTime() + 6 * 86400e3),
    lastUsedAt: new Date(now.getTime() - SESSION_IDLE_MS - 1),
  };
  assert.equal(isSessionLive(idle, now), false);
  const expired = { expiresAt: new Date(now.getTime() - 1), lastUsedAt: now };
  assert.equal(isSessionLive(expired, now), false);
});

test("S-17: production env validation fails fast on weak/partial configuration", () => {
  const bad = validateEnv({
    NODE_ENV: "production",
    SESSION_SECRET: "short",
    AUTH_SECRET: "",
    APP_ORIGIN: "not a url",
    SMTP_HOST: "smtp.example.com",
    GOOGLE_CLIENT_ID: "only-id",
    CHECKOUT_MODE: "demo",
    DATABASE_URL: "postgres://u:p@h/db",
  });
  assert.ok(bad.some((e) => e.includes("SESSION_SECRET")));
  assert.ok(bad.some((e) => e.includes("Partial SMTP")));
  assert.ok(bad.some((e) => e.includes("Partial Google")));
  assert.ok(bad.some((e) => e.includes("CHECKOUT_MODE=demo")));

  const good = validateEnv({
    NODE_ENV: "production",
    SESSION_SECRET: "s".repeat(40),
    AUTH_SECRET: "a".repeat(40),
    APP_ORIGIN: "https://shop.example.com",
    DATABASE_URL: "postgres://u:p@h/db",
  });
  assert.deepEqual(good, []);
  // Development remains usable without production secrets.
  assert.deepEqual(validateEnv({ NODE_ENV: "development" }), []);
});

test("P0-1: drawer is portalled outside the blurred header with focus/scroll management", () => {
  const header = readFileSync("src/components/header.tsx", "utf8");
  assert.match(header, /createPortal\(drawer, document\.body\)/);
  assert.match(header, /overflow = "hidden"/);
  assert.match(header, /event\.key === "Escape"/);
  assert.match(header, /toggleRef\.current\?\.focus\(\)/);
  assert.match(header, /setAttribute\("inert"/);
  const headerElement = header.slice(header.indexOf("<header className="), header.indexOf("</header>"));
  assert.doesNotMatch(headerElement, /fixed inset-0/, "fixed overlay must not live inside <header>");
});

test("P0-2: wallet chip and add-funds '+' exist in header and drawer with honest demo balance", () => {
  const header = readFileSync("src/components/header.tsx", "utf8");
  assert.match(header, /data-testid="header-add-funds"/);
  assert.match(header, /data-testid="drawer-add-funds"/);
  assert.match(header, /WALLET_LOGIN_PATH/);
  assert.match(header, /formatDemoUsd/);
  assert.match(header, /إضافة رصيد/);
  assert.match(header, /Add funds/);
  const wallet = readFileSync("src/lib/wallet.ts", "utf8");
  assert.match(wallet, /usdCents: 0/);
  assert.match(wallet, /isDemo: true/);
});

test("S-05: production CSP is nonce-based via proxy, with no unsafe-eval outside dev", () => {
  const proxy = readFileSync("src/proxy.ts", "utf8");
  assert.match(proxy, /'nonce-\$\{nonce\}'/);
  assert.match(proxy, /'strict-dynamic'/);
  assert.match(proxy, /frame-ancestors 'none'/);
  assert.match(proxy, /isDev \? " 'unsafe-eval'" : ""/);
  const config = readFileSync("next.config.ts", "utf8");
  assert.doesNotMatch(config, /unsafe-inline' 'unsafe-eval'/);
  assert.match(config, /Strict-Transport-Security/);
  assert.match(config, /X-Frame-Options/);
});
