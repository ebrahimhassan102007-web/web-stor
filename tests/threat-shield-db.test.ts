import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = process.cwd();
const stub = path.join(root, "tests/support/stub-server-only.cjs");
const probe = path.join(root, "tests/support/threat-shield-probe.ts");

async function runProbe(command: "bans" | "proxy"): Promise<string> {
  const { stdout } = await run(process.execPath, ["--import", "tsx", probe, command], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "test",
      AUTH_SECRET: "threat-shield-test-secret-with-enough-entropy",
      // Unreachable loopback port: the probe never talks to a real database.
      DATABASE_URL: "postgresql://probe:probe@127.0.0.1:1/evora_test",
      NODE_OPTIONS: `--require ${stub}`,
    } as NodeJS.ProcessEnv,
    timeout: 180_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const output = stdout.trim().split(/\r?\n/).at(-1);
  assert.ok(output, "the probe must print a JSON result");
  return output;
}

/**
 * S-25 — behaviour of the auto-ban shield against a real PostgreSQL engine
 * (PGlite). Proving this needs the `server-only` modules, so it runs in a child
 * process whose result is asserted here.
 */

test("S-25: a scanner hit bans the actor, blocks its next request, and escalates on repeats", async () => {
  const result = JSON.parse(await runProbe("bans")) as {
    first: { banned: boolean; permanent: boolean; expiresAt: string | null; actorKind: string; hasKey: boolean };
    second: { permanent: boolean; expiresAt: string | null; strikes: number };
    third: { permanent: boolean; expiresAt: string | null; strikes: number };
    blockedAfterFirst: boolean;
    bystanderBlocked: boolean;
    blockedAfterThird: boolean;
    tier2: {
      strikes: number[];
      expiries: (string | null)[];
      permanent: boolean;
      blocked: boolean;
      recoveredAfterExpiry: boolean;
    };
    untrusted: {
      spoofedKind: string;
      spoofedIsIp: boolean;
      keySharedWithIpBan: boolean;
      firstBanned: boolean;
      enforcedAtOne: boolean;
      enforcedAtThree: boolean;
      otherClientBlocked: boolean;
      anonymousKind: string;
      anonymousBanned: boolean;
      anonymousHasKey: boolean;
    };
    banCount: number;
    banKeys: { kind: string; permanent: boolean; strikes: number }[];
    eventCount: number;
    anonymousEvents: number;
    throttle: { firstRecorded: boolean; secondRecorded: boolean; secondThrottled: boolean };
  };

  // (b) one scanner hit is enough to ban a trusted IP for 24h.
  assert.equal(result.first.banned, true);
  assert.equal(result.first.actorKind, "ip");
  assert.equal(result.first.hasKey, true);
  assert.equal(result.first.permanent, false);
  assert.equal(result.first.expiresAt, "2026-11-26T00:00:00.000Z");

  // The blocked request is the *next* one, and an unrelated client is untouched.
  assert.equal(result.blockedAfterFirst, true);
  assert.equal(result.bystanderBlocked, false);

  // Repeats escalate 7d -> permanent.
  assert.equal(result.second.strikes, 2);
  assert.equal(result.second.expiresAt, "2026-12-02T00:01:00.000Z");
  assert.equal(result.third.strikes, 3);
  assert.equal(result.third.permanent, true);
  assert.equal(result.third.expiresAt, null);
  assert.equal(result.blockedAfterThird, true);

  // (d) tier 2 escalates 15m -> 2h -> 24h, is never permanent, and expires.
  assert.deepEqual(result.tier2.strikes, [1, 2, 3]);
  assert.deepEqual(result.tier2.expiries, [
    "2026-11-25T00:25:00.000Z",
    "2026-11-25T02:11:00.000Z",
    "2026-11-26T00:12:00.000Z",
  ]);
  assert.equal(result.tier2.permanent, false);
  assert.equal(result.tier2.blocked, true);
  assert.equal(result.tier2.recoveredAfterExpiry, true);

  // (c) untrusted proxy headers never become a trusted IP and never collide
  // with the real IP ban; an unattributable request is never banned.
  assert.equal(result.untrusted.spoofedIsIp, false);
  assert.equal(result.untrusted.spoofedKind, "fingerprint");
  assert.equal(result.untrusted.keySharedWithIpBan, false);
  assert.equal(result.untrusted.firstBanned, true, "the strike is still recorded");
  assert.equal(result.untrusted.enforcedAtOne, false, "one fingerprint strike blocks nobody");
  assert.equal(result.untrusted.enforcedAtThree, true);
  assert.equal(result.untrusted.otherClientBlocked, false, "a different client is unaffected");
  assert.equal(result.untrusted.anonymousKind, "unknown");
  assert.equal(result.untrusted.anonymousBanned, false);
  assert.equal(result.untrusted.anonymousHasKey, false);

  assert.equal(result.banCount, 4, "exactly four actors hold a ban row");
  assert.deepEqual(
    result.banKeys.map((ban) => ban.kind).sort(),
    ["fingerprint", "ip", "ip", "ip"],
  );
  assert.equal(result.anonymousEvents, 1, "an unattributable hit is still logged");
  assert.equal(result.eventCount, 11);

  // A repeat flood from the same actor is recorded once per window, so an
  // unauthenticated attacker cannot turn probing into unbounded database writes.
  assert.equal(result.throttle.firstRecorded, true);
  assert.equal(result.throttle.secondRecorded, false);
  assert.equal(result.throttle.secondThrottled, true);
});

test("S-25: the proxy answers 404 + no-store for /admin and scanner paths without a database", async () => {
  const result = JSON.parse(await runProbe("proxy")) as Record<
    string,
    { status: number; cacheControl: string | null; body: string; csp: boolean }
  >;

  // (a) the web admin is gone for everyone.
  for (const key of ["admin", "adminNested"]) {
    const response = result[key]!;
    assert.equal(response.status, 404, key);
    assert.equal(response.cacheControl, "private, no-store, no-cache, must-revalidate", key);
    assert.equal(response.body, "", `${key} must not leak markup`);
    assert.equal(response.csp, true, `${key} must still carry a CSP`);
  }

  // (b) scanner families are indistinguishable from a missing page.
  for (const key of ["env", "git", "wpAdmin", "wpLogin", "phpmyadmin", "cgi", "actuator"]) {
    assert.equal(result[key]!.status, 404, key);
    assert.equal(result[key]!.cacheControl, "private, no-store, no-cache, must-revalidate", key);
    assert.equal(result[key]!.body, "", key);
  }

  // Nothing about the storefront changed.
  assert.equal(result.home!.status, 200);
  assert.equal(result.product!.status, 200);
  assert.equal(result.administerLike!.status, 200, "only the /admin segment is removed");
  assert.equal(result.account!.status, 200);
  assert.equal(result.account!.cacheControl, "private, no-store, no-cache, must-revalidate");
  // S-26: the merchant portal is reachable but never cacheable, and is not
  // swallowed by the /admin elimination rule.
  assert.equal(result.seller!.status, 200);
  assert.equal(result.seller!.cacheControl, "private, no-store, no-cache, must-revalidate");
});
