/**
 * Threat-shield probe (S-25).
 *
 * Runs the server-only shield modules against a real embedded PostgreSQL
 * (PGlite) in a child process, because plain `tsx --test` cannot load
 * `server-only` modules. The test asserts on the JSON printed to stdout.
 *
 * Usage: node --import tsx tests/support/threat-shield-probe.ts <bans|proxy>
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import * as schema from "../../src/lib/db/schema";
import { activeBanForRequest, recordThreat, type ShieldDatabase } from "../../src/lib/security/threat-shield";
import { resolveThreatActor } from "../../src/lib/security/threat-actor";

const T0 = new Date("2026-11-25T00:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function req(
  ip: string | null,
  headers: Record<string, string> = {},
  urlPath = "/.env",
): Request {
  const init: Record<string, string> = { ...headers };
  if (ip) init["x-forwarded-for"] = ip;
  return new Request(`http://localhost:3000${urlPath}`, { method: "GET", headers: init });
}

const CURIOUS_BOT = {
  "user-agent": "python-requests/2.31.0",
  "accept-language": "en-US",
  "accept-encoding": "gzip, deflate",
};
const OTHER_BOT = {
  "user-agent": "Go-http-client/1.1",
  "accept-language": "de-DE",
  "accept-encoding": "identity",
};
const BROWSER = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
  "accept-encoding": "gzip, deflate, br",
  "sec-ch-ua": '"Chromium";v="131"',
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
};

async function banFlow(database: ShieldDatabase) {
  process.env.TRUST_PROXY_IP_HEADERS = "true";
  const attacker = req("203.0.113.9", CURIOUS_BOT);
  const bystander = req("198.51.100.5", BROWSER);

  const first = await recordThreat(attacker, "scanner_path", { database, now: at(0) });
  const blockedAfterFirst = await activeBanForRequest(attacker, database, at(MINUTE));
  const bystanderBlocked = await activeBanForRequest(bystander, database, at(MINUTE));

  const second = await recordThreat(attacker, "scanner_path", { database, now: at(MINUTE) });
  const third = await recordThreat(attacker, "honeypot", { database, now: at(2 * MINUTE) });
  const blockedAfterThird = await activeBanForRequest(attacker, database, at(3 * MINUTE));

  // Tier 2 cooldown for rate-limit abuse from a clean IP.
  const brute = req("203.0.113.20", CURIOUS_BOT);
  const r1 = await recordThreat(brute, "rate_limit_abuse", { database, now: at(10 * MINUTE) });
  const r2 = await recordThreat(brute, "rate_limit_abuse", { database, now: at(11 * MINUTE) });
  const r3 = await recordThreat(brute, "rate_limit_abuse", { database, now: at(12 * MINUTE) });
  const bruteBlocked = await activeBanForRequest(brute, database, at(13 * MINUTE));
  const bruteRecovered = await activeBanForRequest(brute, database, at(13 * MINUTE + DAY + HOUR));

  // Untrusted proxy headers: identity degrades to a header fingerprint.
  delete process.env.TRUST_PROXY_IP_HEADERS;
  const spoofed = req("203.0.113.9", CURIOUS_BOT);
  const spoofedActor = resolveThreatActor(spoofed);
  const fpOne = await recordThreat(spoofed, "honeypot", { database, now: at(20 * MINUTE) });
  const fpEnforcedAtOne = await activeBanForRequest(spoofed, database, at(21 * MINUTE));
  await recordThreat(spoofed, "honeypot", { database, now: at(22 * MINUTE) });
  await recordThreat(spoofed, "honeypot", { database, now: at(23 * MINUTE) });
  const fpEnforcedAtThree = await activeBanForRequest(spoofed, database, at(24 * MINUTE));
  const otherClientBlocked = await activeBanForRequest(
    req("203.0.113.9", OTHER_BOT),
    database,
    at(24 * MINUTE),
  );

  // A request with no attributable identity at all.
  const anonymous = await recordThreat(new Request("http://localhost:3000/.env"), "scanner_path", {
    database,
    now: at(30 * MINUTE),
  });

  // Write amplification guard: the same actor is recorded at most once per
  // window, so a probe flood cannot force a write per request.
  process.env.TRUST_PROXY_IP_HEADERS = "true";
  const flood = req("203.0.113.99", OTHER_BOT);
  const floodFirst = await recordThreat(flood, "scanner_path", { database, now: at(40 * MINUTE) });
  const floodSecond = await recordThreat(flood, "scanner_path", { database, now: at(40 * MINUTE + 1_000) });

  const bans = await database.select().from(schema.securityBans);
  const events = await database.select().from(schema.securityThreatEvents);

  return {
    first: {
      banned: first.banned,
      tier: first.strikes,
      permanent: first.permanent,
      expiresAt: first.expiresAt?.toISOString() ?? null,
      actorKind: first.actor.kind,
      hasKey: first.actor.key !== null,
    },
    second: { permanent: second.permanent, expiresAt: second.expiresAt?.toISOString() ?? null, strikes: second.strikes },
    third: { permanent: third.permanent, expiresAt: third.expiresAt?.toISOString() ?? null, strikes: third.strikes },
    blockedAfterFirst: blockedAfterFirst !== null,
    bystanderBlocked: bystanderBlocked !== null,
    blockedAfterThird: blockedAfterThird !== null,
    tier2: {
      strikes: [r1.strikes, r2.strikes, r3.strikes],
      expiries: [r1.expiresAt, r2.expiresAt, r3.expiresAt].map((value) => value?.toISOString() ?? null),
      permanent: r3.permanent,
      blocked: bruteBlocked !== null,
      recoveredAfterExpiry: bruteRecovered === null,
    },
    untrusted: {
      spoofedKind: spoofedActor.kind,
      spoofedIsIp: spoofedActor.kind === "ip",
      keySharedWithIpBan: fpOne.actor.key === first.actor.key,
      firstBanned: fpOne.banned,
      enforcedAtOne: fpEnforcedAtOne !== null,
      enforcedAtThree: fpEnforcedAtThree !== null,
      otherClientBlocked: otherClientBlocked !== null,
      anonymousKind: anonymous.actor.kind,
      anonymousBanned: anonymous.banned,
      anonymousHasKey: anonymous.actor.key !== null,
    },
    banCount: bans.length,
    banKeys: bans.map((ban) => ({ kind: ban.actorKind, permanent: ban.permanent, strikes: ban.strikes })),
    eventCount: events.length,
    throttle: {
      firstRecorded: floodFirst.recorded,
      secondRecorded: floodSecond.recorded,
      secondThrottled: floodSecond.throttled,
    },
    anonymousEvents: events.filter((event) => event.actorKey === null).length,
  };
}

async function proxyFlow() {
  // No database is reachable here on purpose: the proxy must still answer.
  const { proxy } = await import("../../src/proxy");
  const { NextRequest } = await import("next/server");

  const call = async (pathname: string, headers: Record<string, string> = {}) => {
    const response = await proxy(
      new NextRequest(`http://localhost:3000${pathname}`, { headers }),
    );
    return {
      path: pathname,
      status: response.status,
      cacheControl: response.headers.get("cache-control"),
      contentType: response.headers.get("content-type"),
      body: await response.text(),
      csp: response.headers.get("content-security-policy") !== null,
    };
  };

  return {
    admin: await call("/admin"),
    adminNested: await call("/admin/users"),
    env: await call("/.env"),
    git: await call("/.git/config"),
    wpAdmin: await call("/wp-admin/setup.php"),
    wpLogin: await call("/wp-login.php"),
    phpmyadmin: await call("/phpmyadmin/index.php"),
    cgi: await call("/cgi-bin/exec"),
    actuator: await call("/actuator/env"),
    home: await call("/"),
    product: await call("/products/evora-hoodie"),
    account: await call("/account"),
    seller: await call("/seller"),
    administerLike: await call("/administrator-guide"),
  };
}

async function main() {
  const command = process.argv[2] ?? "bans";
  if (command === "proxy") {
    process.env.DATABASE_URL = "postgres://nobody:nopass@127.0.0.1:1/unreachable";
    process.stdout.write(JSON.stringify(await proxyFlow()));
    return;
  }

  const client = new PGlite();
  try {
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    const database = pglite as unknown as ShieldDatabase;
    process.stdout.write(JSON.stringify(await banFlow(database)));
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error("probe failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
