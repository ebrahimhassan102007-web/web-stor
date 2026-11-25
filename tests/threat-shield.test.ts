import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  FINGERPRINT_ENFORCE_MIN_STRIKES,
  FINGERPRINT_MAX_BAN_MS,
  TIER2_COOLDOWN_LADDER_MS,
  banIsActive,
  classifyRequestPath,
  isAdminPath,
  looksLikeOrdinaryBrowser,
  matchScannerPath,
  planBanStrike,
  shouldEnforceBan,
  type BanSnapshot,
} from "../src/lib/security/threat-policy";
import { fingerprintSource, resolveThreatActor } from "../src/lib/security/threat-actor";
import { HONEYPOT_FIELD, isHoneypotTripped } from "../src/lib/security/honeypot";
import { JSON_BODY_STATUS, readJsonBody } from "../src/lib/security/read-json";

/**
 * S-25 — smart adversarial auto-ban shield, web-admin elimination, ephemeral
 * hygiene and the local owner CLI.
 *
 * These tests cover the pure decision logic plus source-level invariants. The
 * database-backed behaviour (a ban actually blocking the next request, cooldown
 * escalation, hygiene purging) is proved in `threat-shield-db.test.ts` and
 * `ephemeral-hygiene.test.ts` against a real embedded PostgreSQL.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = new Date("2026-11-25T00:00:00.000Z").getTime();

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

function walk(directory: string): string[] {
  const entries = readdirSync(directory);
  return entries.flatMap((entry) => {
    const full = path.join(directory, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function snapshot(overrides: Partial<BanSnapshot> = {}): BanSnapshot {
  return {
    strikes: 1,
    tier: 1,
    permanent: false,
    active: true,
    liftedAtMs: null,
    lastStrikeAtMs: NOW,
    expiresAtMs: NOW + DAY,
    ...overrides,
  };
}

/* --------------------------- (a) /admin is gone --------------------------- */

test("S-25: /admin is an unconditional 404 for everyone, and never a ban trigger", () => {
  for (const pathname of [
    "/admin",
    "/admin/",
    "/admin/users",
    "/admin/orders?x=1".split("?")[0]!,
    "/ADMIN",
    "/Admin/Users",
    "//admin",
    "/./admin",
    "/foo/../admin",
    "/%61dmin",
  ]) {
    assert.equal(isAdminPath(pathname), true, pathname);
    assert.deepEqual(classifyRequestPath(pathname), { action: "not-found" }, pathname);
  }

  // Nothing else is swallowed by the admin rule.
  for (const pathname of ["/administrator-guide", "/admins", "/", "/account/admin"]) {
    assert.equal(isAdminPath(pathname), false, pathname);
    assert.equal(classifyRequestPath(pathname).action, "allow", pathname);
  }

  assert.equal(existsSync(path.join(process.cwd(), "src/app/admin/page.tsx")), false);
  assert.equal(existsSync(path.join(process.cwd(), "src/app/api/admin")), false);

  const proxy = source("src/proxy.ts");
  assert.match(proxy, /hiddenNotFound/);
  assert.match(proxy, /status: 404/);
  assert.match(proxy, /private, no-store, no-cache, must-revalidate/);
});

test("S-25: no application code links to the removed admin surface", () => {
  const offenders = walk(path.join(process.cwd(), "src"))
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => {
      const text = readFileSync(file, "utf8");
      return (
        /href=\{?["'`]\/admin/.test(text) ||
        /["'`]\/api\/admin/.test(text) ||
        /fetch\(\s*["'`]\/admin/.test(text)
      );
    })
    .map((file) => path.relative(process.cwd(), file));
  assert.deepEqual(offenders, []);
});

/* --------------------------- (b) scanner traps --------------------------- */

test("S-25: scanner and exploit path families are trapped, ordinary paths are not", () => {
  const trapped = [
    "/.env",
    "/.env.local",
    "/.env.production",
    "/.git/config",
    "/.git/HEAD",
    "/.svn/entries",
    "/.aws/credentials",
    "/wp-admin",
    "/wp-admin/setup-config.php",
    "/wp-login.php",
    "/wp-content/uploads/x.php",
    "/xmlrpc.php",
    "/phpmyadmin/index.php",
    "/pma/",
    "/myadmin",
    "/cgi-bin/test.cgi",
    "/actuator",
    "/actuator/env",
    "/server-status",
    "/vendor/phpunit/src/x",
  ];
  for (const pathname of trapped) {
    assert.equal(matchScannerPath(pathname), pathname.startsWith("/.env") ? "/.env" : matchScannerPath(pathname), pathname);
    assert.notEqual(matchScannerPath(pathname), null, pathname);
    const verdict = classifyRequestPath(pathname);
    assert.equal(verdict.action, "trap", pathname);
  }

  // Obfuscation an attacker would try: encoding, duplicate and dot segments.
  for (const pathname of ["/%2eenv", "/.env%2flocal", "//.env", "/x/../.env", "/.GIT/config"]) {
    assert.equal(classifyRequestPath(pathname).action, "trap", pathname);
  }

  // Genuine storefront paths must never be treated as an attack.
  for (const pathname of [
    "/",
    "/products",
    "/products/evora-hoodie",
    "/collections/all",
    "/account/orders",
    "/cart",
    "/checkout",
    "/login",
    "/support-bot",
    "/api/cart",
    "/wp-admin-case-study",
    "/environment",
  ]) {
    assert.equal(classifyRequestPath(pathname).action, "allow", pathname);
  }
});

test("S-25: a single scanner hit bans a trusted IP for 24h, escalating to permanent", () => {
  const first = planBanStrike(null, { tier: 1, signal: "scanner_path", actorKind: "ip", nowMs: NOW });
  assert.equal(first.strikes, 1);
  assert.equal(first.permanent, false);
  assert.equal(first.expiresAtMs, NOW + DAY);

  const second = planBanStrike(snapshot({ strikes: 1, expiresAtMs: NOW + DAY }), {
    tier: 1,
    signal: "scanner_path",
    actorKind: "ip",
    nowMs: NOW + MINUTE,
  });
  assert.equal(second.strikes, 2);
  assert.equal(second.permanent, false);
  assert.equal(second.expiresAtMs, NOW + MINUTE + 7 * DAY);

  const third = planBanStrike(snapshot({ strikes: 2, expiresAtMs: NOW + 7 * DAY }), {
    tier: 1,
    signal: "honeypot",
    actorKind: "ip",
    nowMs: NOW + 2 * MINUTE,
  });
  assert.equal(third.strikes, 3);
  assert.equal(third.permanent, true);
  assert.equal(third.expiresAtMs, null);
});

/* ------------------- (c) no collateral from weak identity ------------------- */

test("S-25: a ban never shortens, and a fingerprint actor can never be permanent", () => {
  const extended = planBanStrike(snapshot({ tier: 2, strikes: 1, expiresAtMs: NOW + 7 * DAY }), {
    tier: 2,
    signal: "rate_limit_abuse",
    actorKind: "ip",
    nowMs: NOW + MINUTE,
  });
  assert.equal(extended.expiresAtMs, NOW + 7 * DAY, "an existing ban is never weakened");
  assert.equal(extended.permanent, false, "tier 2 never produces a permanent ban");

  let ipPlan = planBanStrike(null, { tier: 1, signal: "scanner_path", actorKind: "ip", nowMs: NOW });
  let fingerprintPlan = planBanStrike(null, {
    tier: 1,
    signal: "scanner_path",
    actorKind: "fingerprint",
    nowMs: NOW,
  });
  for (let strike = 0; strike < 4; strike += 1) {
    ipPlan = planBanStrike(
      { ...snapshot(), strikes: strike + 1, permanent: ipPlan.permanent, expiresAtMs: ipPlan.expiresAtMs, lastStrikeAtMs: NOW + strike * MINUTE },
      { tier: 1, signal: "scanner_path", actorKind: "ip", nowMs: NOW + (strike + 1) * MINUTE },
    );
    fingerprintPlan = planBanStrike(
      {
        ...snapshot(),
        strikes: strike + 1,
        permanent: fingerprintPlan.permanent,
        expiresAtMs: fingerprintPlan.expiresAtMs,
        lastStrikeAtMs: NOW + strike * MINUTE,
      },
      { tier: 1, signal: "scanner_path", actorKind: "fingerprint", nowMs: NOW + (strike + 1) * MINUTE },
    );
  }
  assert.equal(ipPlan.permanent, true);
  assert.equal(fingerprintPlan.permanent, false);
  assert.ok(
    (fingerprintPlan.expiresAtMs ?? 0) <= NOW + 4 * MINUTE + FINGERPRINT_MAX_BAN_MS,
    "a spoofable fingerprint is capped at 24h",
  );
});

test("S-25: a banned IP is enforced immediately, a fingerprint only after repeat strikes and never for a browser", () => {
  const ipBan = { actorKind: "ip", strikes: 1, active: true, permanent: false, liftedAtMs: null, expiresAtMs: NOW + DAY };
  assert.equal(shouldEnforceBan(ipBan, { requestLooksLikeBrowser: true, nowMs: NOW }), true);
  assert.equal(shouldEnforceBan({ ...ipBan, expiresAtMs: NOW - 1 }, { requestLooksLikeBrowser: true, nowMs: NOW }), false);
  assert.equal(shouldEnforceBan({ ...ipBan, liftedAtMs: NOW }, { requestLooksLikeBrowser: true, nowMs: NOW }), false);

  const fingerprintBan = {
    actorKind: "fingerprint",
    strikes: FINGERPRINT_ENFORCE_MIN_STRIKES - 1,
    active: true,
    permanent: false,
    liftedAtMs: null,
    expiresAtMs: NOW + HOUR,
  };
  assert.equal(
    shouldEnforceBan(fingerprintBan, { requestLooksLikeBrowser: false, nowMs: NOW }),
    false,
    "one strike on a shared fingerprint must not block anyone",
  );
  assert.equal(
    shouldEnforceBan(
      { ...fingerprintBan, strikes: FINGERPRINT_ENFORCE_MIN_STRIKES },
      { requestLooksLikeBrowser: false, nowMs: NOW },
    ),
    true,
  );
  assert.equal(
    shouldEnforceBan(
      { ...fingerprintBan, strikes: FINGERPRINT_ENFORCE_MIN_STRIKES },
      { requestLooksLikeBrowser: true, nowMs: NOW },
    ),
    false,
    "a request that looks like an ordinary browser is never blocked on a header hash",
  );
});

test("S-25: without trusted proxy headers nothing becomes a trusted IP, and an anonymous request is unbannable", () => {
  const browserHeaders = {
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
    "accept-language": "en-GB,en;q=0.9",
    "sec-ch-ua": '"Chromium";v="131"',
    "sec-fetch-mode": "navigate",
  };

  const untrusted = resolveThreatActor(
    new Request("http://localhost/.env", { headers: { ...browserHeaders, "x-forwarded-for": "203.0.113.5" } }),
    { trustProxyHeaders: false },
  );
  assert.equal(untrusted.kind, "fingerprint");
  assert.equal(untrusted.ip, null);
  assert.match(untrusted.key ?? "", /^fp:[a-f0-9]{64}$/);

  const trusted = resolveThreatActor(
    new Request("http://localhost/.env", { headers: { ...browserHeaders, "x-forwarded-for": "203.0.113.5" } }),
    { trustProxyHeaders: true },
  );
  assert.equal(trusted.kind, "ip");
  assert.match(trusted.key ?? "", /^ip:[a-f0-9]{64}$/);
  assert.notEqual(trusted.key, untrusted.key);

  // Stable for the same client, different for a different one.
  const again = resolveThreatActor(
    new Request("http://localhost/other", { headers: { ...browserHeaders, "x-forwarded-for": "203.0.113.5" } }),
    { trustProxyHeaders: true },
  );
  assert.equal(again.key, trusted.key);

  const otherIp = resolveThreatActor(
    new Request("http://localhost/.env", { headers: { ...browserHeaders, "x-forwarded-for": "198.51.100.7" } }),
    { trustProxyHeaders: true },
  );
  assert.notEqual(otherIp.key, trusted.key);

  const anonymous = resolveThreatActor(new Request("http://localhost/.env"), { trustProxyHeaders: false });
  assert.equal(anonymous.kind, "unknown");
  assert.equal(anonymous.key, null, "an unattributable request must never be bannable");

  // A bare IP literal is not trusted just because it is well formed.
  const invalid = resolveThreatActor(
    new Request("http://localhost/.env", { headers: { "x-forwarded-for": "not-an-ip", ...browserHeaders } }),
    { trustProxyHeaders: true },
  );
  assert.equal(invalid.kind, "fingerprint");
});

test("S-25: the ban fingerprint ignores per-request headers and keeps distinguishing ones", () => {
  const base = {
    "user-agent": "curl/8.4.0",
    "accept-language": "en-US",
    "accept-encoding": "gzip",
  };
  const first = fingerprintSource(new Headers({ ...base, cookie: "session=abc", "content-type": "application/json" }));
  const second = fingerprintSource(new Headers({ ...base, cookie: "session=xyz", "content-type": "text/plain", origin: "https://evil.test" }));
  assert.equal(first, second, "session and per-request headers must not change the identity");

  const different = fingerprintSource(new Headers({ ...base, "user-agent": "python-requests/2.31" }));
  assert.notEqual(different, first);
  assert.equal(fingerprintSource(new Headers({ cookie: "a=b", origin: "https://x.test" })), "");
});

test("S-25: only requests that really look like a browser are exempted from fingerprint bans", () => {
  assert.equal(
    looksLikeOrdinaryBrowser(
      new Headers({
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
        "accept-language": "en-US",
        "sec-ch-ua": '"Chromium";v="131"',
        "sec-fetch-mode": "navigate",
      }),
    ),
    true,
  );
  assert.equal(looksLikeOrdinaryBrowser(new Headers({ "user-agent": "curl/8.4.0" })), false);
  assert.equal(
    looksLikeOrdinaryBrowser(
      new Headers({ "user-agent": "Mozilla/5.0 (X11) Chrome/131", "accept-language": "en" }),
    ),
    false,
    "missing Fetch metadata / client hints is not an ordinary browser",
  );
});

/* ---------------------- (d) cooldown escalation ladder ---------------------- */

test("S-25: probed brute force escalates 15m -> 2h -> 24h and then expires cleanly", () => {
  assert.deepEqual(TIER2_COOLDOWN_LADDER_MS, [15 * MINUTE, 2 * HOUR, DAY]);

  let plan = planBanStrike(null, { tier: 2, signal: "rate_limit_abuse", actorKind: "ip", nowMs: NOW });
  const ladder = [plan.expiresAtMs! - NOW];
  assert.equal(plan.permanent, false);
  assert.equal(plan.tier, 2);

  for (let strike = 1; strike <= 4; strike += 1) {
    plan = planBanStrike(
      {
        strikes: plan.strikes,
        tier: plan.tier,
        permanent: plan.permanent,
        active: true,
        liftedAtMs: null,
        lastStrikeAtMs: plan.lastStrikeAtMs,
        expiresAtMs: plan.expiresAtMs,
      },
      { tier: 2, signal: "rate_limit_abuse", actorKind: "ip", nowMs: plan.lastStrikeAtMs + MINUTE },
    );
    ladder.push(plan.expiresAtMs! - plan.lastStrikeAtMs);
  }

  assert.equal(plan.permanent, false, "a rate-limit ban is never permanent");
  assert.deepEqual(ladder.slice(0, 3), [15 * MINUTE, 2 * HOUR, DAY]);
  assert.equal(ladder[3], DAY, "the ladder is bounded at 24h");

  // Every one of these cooldowns ends on its own.
  assert.equal(banIsActive({ active: true, permanent: false, liftedAtMs: null, expiresAtMs: NOW + 15 * MINUTE }, NOW + 15 * MINUTE + 1), false);
  assert.equal(banIsActive({ active: true, permanent: false, liftedAtMs: null, expiresAtMs: NOW + 15 * MINUTE }, NOW + 15 * MINUTE - 1), true);
  assert.equal(banIsActive({ active: true, permanent: true, liftedAtMs: null, expiresAtMs: null }, NOW + 10 * DAY), true);
  assert.equal(banIsActive({ active: false, permanent: true, liftedAtMs: null, expiresAtMs: null }, NOW), false);

  // A long-quiet actor starts again at the first rung, not at 24h.
  const later = planBanStrike(snapshot({ tier: 2, strikes: 3, lastStrikeAtMs: NOW, expiresAtMs: NOW + DAY }), {
    tier: 2,
    signal: "rate_limit_abuse",
    actorKind: "ip",
    nowMs: NOW + 3 * DAY,
  });
  assert.equal(later.strikes, 1);
  assert.equal(later.expiresAtMs, NOW + 3 * DAY + 15 * MINUTE);
});

/* ------------------------------ honeypot ------------------------------ */

test("S-25: the honeypot trips only on a real value", () => {
  assert.equal(isHoneypotTripped({}), false);
  assert.equal(isHoneypotTripped({ [HONEYPOT_FIELD]: "" }), false);
  assert.equal(isHoneypotTripped({ [HONEYPOT_FIELD]: "   " }), false);
  assert.equal(isHoneypotTripped({ [HONEYPOT_FIELD]: null }), false);
  assert.equal(isHoneypotTripped(null), false);
  assert.equal(isHoneypotTripped([]), false);
  assert.equal(isHoneypotTripped("text"), false);
  assert.equal(isHoneypotTripped({ [HONEYPOT_FIELD]: "https://spam.example" }), true);
  assert.equal(isHoneypotTripped({ [HONEYPOT_FIELD]: true }), true);
  // A prototype-inherited key is not a submitted field.
  assert.equal(isHoneypotTripped(Object.create({ [HONEYPOT_FIELD]: "x" })), false);
});

test("S-25: the honeypot input is invisible, un-focusable and cannot shift layout", () => {
  const component = source("src/components/honeypot-field.tsx");
  assert.match(component, /aria-hidden="true"/);
  assert.match(component, /tabIndex=\{-1\}/);
  assert.match(component, /autoComplete="off"/);
  assert.match(component, /-left-\[9999px\]/);
  assert.match(component, /h-px/);
  assert.match(component, /w-px/);
  assert.match(component, /overflow-hidden/);

  for (const file of [
    "src/components/auth-panel.tsx",
    "src/components/password-recovery-form.tsx",
    "src/app/checkout/page.tsx",
  ]) {
    const text = source(file);
    assert.match(text, /<HoneypotField/, file);
    assert.match(text, /\[HONEYPOT_FIELD\]/, file);
  }

  for (const file of [
    "src/app/api/auth/email/login/route.ts",
    "src/app/api/auth/email/register/route.ts",
    "src/app/api/auth/email/forgot/route.ts",
    "src/app/api/checkout/route.ts",
  ]) {
    const text = source(file);
    assert.match(text, /isHoneypotTripped\(body\.value\)/, file);
    assert.match(text, /rejectHoneypot/, file);
  }
});

/* ---------------------- prototype pollution signal ---------------------- */

test("S-25: prototype-pollution bodies are rejected and mapped to 400", async () => {
  const body = new Request("http://localhost/api/cart/items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"safe":{"constructor":{"prototype":{"polluted":true}}}}',
  });
  assert.deepEqual(await readJsonBody(body), { ok: false, reason: "prototype-pollution" });
  assert.equal(JSON_BODY_STATUS["prototype-pollution"], 400);

  const benign = new Request("http://localhost/api/cart/items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"productId":1,"quantity":2}',
  });
  const parsed = await readJsonBody(benign);
  assert.equal(parsed.ok, true);
});

/* ------------------------ central enforcement wiring ------------------------ */

test("S-25: every mutating API route runs the central guard instead of an ad-hoc CSRF check", () => {
  const routes = walk(path.join(process.cwd(), "src/app/api")).filter((file) =>
    file.endsWith("route.ts"),
  );
  // Provider webhooks authenticate with an HMAC signature over the raw body,
  // not a browser Origin/CSRF token, so they are guarded separately.
  const isWebhook = (file: string) => file.includes(`${path.sep}webhooks${path.sep}`);
  const mutating = routes
    .filter((file) => /export async function (POST|PATCH|PUT|DELETE)/.test(readFileSync(file, "utf8")))
    .filter((file) => !isWebhook(file));
  assert.ok(mutating.length >= 15);

  for (const file of routes.filter(isWebhook)) {
    const text = readFileSync(file, "utf8");
    assert.match(text, /verifyWalletWebhookSignature/, path.relative(process.cwd(), file));
  }

  for (const file of mutating) {
    const text = readFileSync(file, "utf8");
    const relative = path.relative(process.cwd(), file);
    assert.match(text, /guardMutatingRequest\(/, relative);
    assert.doesNotMatch(text, /verifySameOrigin\(/, `${relative} must use the central guard`);
  }

  const guard = source("src/lib/security/request-guard.ts");
  assert.match(guard, /recordThreat\(request, "csrf_forgery"\)/);
  assert.match(guard, /activeBanForRequest/);
  assert.match(guard, /private, no-store/);
});

/* ------------------------------- owner CLI ------------------------------- */

test("S-25: administration is CLI-only and cannot be reached from the web app", () => {
  const cli = source("scripts/owner-ops.ts");
  assert.match(cli, /NEXT_RUNTIME/);
  assert.match(cli, /typeof window !== "undefined"/);
  assert.match(cli, /credit_refund/);
  assert.match(cli, /runEphemeralHygiene/);

  const webImports = walk(path.join(process.cwd(), "src"))
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => readFileSync(file, "utf8").includes("scripts/owner-ops"))
    .map((file) => path.relative(process.cwd(), file));
  assert.deepEqual(webImports, [], "the owner CLI must never be imported by the app");

  const pkg = JSON.parse(source("package.json")) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts.ops, "tsx scripts/owner-ops.ts");
});

test("S-25: threat shield modules never leak raw addresses or secrets into the schema", () => {
  const schemaText = source("src/lib/db/schema.ts");
  const threatBlock = schemaText.slice(
    schemaText.indexOf("export const securityThreatEvents"),
    schemaText.indexOf("/* Inferred types"),
  );
  assert.match(threatBlock, /actor_key/);
  assert.doesNotMatch(threatBlock, /\bip_address\b|\braw_ip\b|\buser_agent\b|\bcookie\b/i);

  const shield = source("src/lib/security/threat-shield.ts");
  assert.match(shield, /createHmac|threat-actor/);
  assert.doesNotMatch(shield, /console\.log/);
});
