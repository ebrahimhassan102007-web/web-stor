import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { safeErrorForLog } from "../src/lib/log-safety";
import {
  FALLBACK_CLIENT_MULTIPLIER,
  planAuthRateBuckets,
  type AuthRatePolicy,
} from "../src/lib/security/auth-rate-policy";

const run = promisify(execFile);

/**
 * Regression tests for the findings closed in the 2026-11-25 audit:
 *  - SEC-01 auth rate limits disappeared when no trusted client IP existed,
 *  - SEC-02 unauthenticated password-reset consumption ran scrypt per request,
 *  - SEC-03 guest promo limits were keyed to a disposable cart,
 *  - SEC-04 raw driver errors (with bound parameters) reached the logs.
 */

const LOGIN_POLICY: AuthRatePolicy = {
  windowMs: 15 * 60 * 1000,
  ipLimit: 40,
  combinedLimit: 10,
  emailLimit: 60,
};

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/auth/email/login", {
    method: "POST",
    headers,
  });
}

/* ----------------------------- SEC-01 ----------------------------- */

test("SEC-01: identity-less auth requests still produce a bounded bucket without a trusted proxy", () => {
  const plans = planAuthRateBuckets({
    request: request(),
    email: undefined,
    policy: { windowMs: 15 * 60 * 1000, ipLimit: 20 },
    trustProxyHeaders: false,
  });

  assert.equal(plans.length, 1, "an empty plan means 'no limit at all'");
  assert.equal(plans[0]!.kind, "ip");
  assert.equal(plans[0]!.limit, 20 * FALLBACK_CLIENT_MULTIPLIER);
  assert.ok(Number.isSafeInteger(plans[0]!.limit) && plans[0]!.limit > 0);
});

test("SEC-01: the fallback bucket is stable per client fingerprint and never global", () => {
  const make = (userAgent: string) =>
    planAuthRateBuckets({
      request: request({ "user-agent": userAgent }),
      email: undefined,
      policy: { windowMs: 60_000, ipLimit: 5 },
      trustProxyHeaders: false,
    })[0]!;

  const first = make("Mozilla/5.0 (X11; Linux x86_64) Firefox/128");
  const again = make("Mozilla/5.0 (X11; Linux x86_64) Firefox/128");
  const other = make("Mozilla/5.0 (Macintosh) Safari/605");

  assert.equal(first.value, again.value, "the same client must map to one bucket");
  assert.notEqual(first.value, other.value, "distinct clients must not share a bucket");
  assert.match(first.value, /^fallback:fp:[a-f0-9]{32}$/);
});

test("SEC-01: spoofed forwarding headers are ignored when the proxy is not trusted", () => {
  const plans = planAuthRateBuckets({
    request: request({ "x-forwarded-for": "203.0.113.7" }),
    email: undefined,
    policy: { windowMs: 60_000, ipLimit: 5 },
    trustProxyHeaders: false,
  });
  assert.match(plans[0]!.value, /^fallback:fp:/);
  assert.equal(plans[0]!.value.includes("203.0.113.7"), false);
});

test("SEC-01: a trusted proxy resolves the client from the right of X-Forwarded-For", () => {
  const plans = planAuthRateBuckets({
    // Attacker-controlled left entry, proxy-appended right entry.
    request: request({ "x-forwarded-for": "10.9.9.9, 198.51.100.23" }),
    email: undefined,
    policy: { windowMs: 60_000, ipLimit: 5 },
    trustProxyHeaders: true,
  });
  assert.deepEqual(plans[0]!.value, "ip:198.51.100.23");
  assert.equal(plans[0]!.limit, 5, "a real IP keeps the tight configured limit");
});

test("SEC-01: an email-bearing request never gains a shared per-client bucket", () => {
  const base = { policy: LOGIN_POLICY, trustProxyHeaders: false };
  const victim = planAuthRateBuckets({ ...base, request: request(), email: "victim@example.invalid" });
  const attacker = planAuthRateBuckets({ ...base, request: request(), email: "attacker@example.invalid" });

  // A guessable fingerprint must not be able to lock the real owner out, so
  // neither a per-client nor a per-(fingerprint,email) bucket is created: the
  // documented per-account ceiling stays the enforced control.
  assert.deepEqual(victim.map((plan) => plan.kind), ["email"]);
  assert.equal(victim[0]!.limit, LOGIN_POLICY.emailLimit);
  assert.notEqual(victim[0]!.value, attacker[0]!.value);

  // With a trusted address the tight per-source bucket is still applied.
  const trusted = planAuthRateBuckets({ ...base, trustProxyHeaders: true, request: request({ "x-forwarded-for": "198.51.100.7" }), email: "victim@example.invalid" });
  assert.deepEqual(trusted.map((plan) => plan.kind), ["ip", "ip-email", "email"]);
  assert.equal(trusted[1]!.limit, LOGIN_POLICY.combinedLimit);
});

test("SEC-01: every real caller now plans at least one bucket", () => {
  const cases: Array<{ email: string | undefined; policy: AuthRatePolicy }> = [
    { email: undefined, policy: { windowMs: 1, ipLimit: 20 } }, // password-reset consume
    { email: undefined, policy: { windowMs: 1, ipLimit: 12 } }, // 2FA verify
    { email: undefined, policy: { windowMs: 1, ipLimit: 20 } }, // Google start
    { email: undefined, policy: { windowMs: 1, ipLimit: 40 } }, // Google callback
    { email: "user@example.invalid", policy: LOGIN_POLICY },
    { email: "user@example.invalid", policy: { windowMs: 1, ipLimit: 8, emailLimit: 5 } },
    { email: "user@example.invalid", policy: { windowMs: 1, ipLimit: 8 } },
  ];
  for (const trustProxyHeaders of [true, false]) {
    for (const current of cases) {
      const plans = planAuthRateBuckets({
        request: request({ "x-forwarded-for": "198.51.100.9" }),
        email: current.email,
        policy: current.policy,
        trustProxyHeaders,
      });
      assert.ok(plans.length >= 1, `no bucket planned for ${JSON.stringify(current)}`);
      for (const plan of plans) assert.ok(plan.limit > 0);
    }
  }
});

test("SEC-01: identity-less auth limiting fails closed when no bucket can be taken", async () => {
  const probe = path.join(process.cwd(), "tests/support/auth-rate-limit-probe.ts");
  const stub = path.join(process.cwd(), "tests/support/stub-server-only.cjs");

  const { stdout } = await run(process.execPath, ["--import", "tsx", probe], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "development",
      // Unreachable loopback port: the only network contact is a local
      // connection-refused, never an external service.
      DATABASE_URL: "postgresql://probe:probe@127.0.0.1:1/evora_test",
      NODE_OPTIONS: `--require ${stub}`,
    } as NodeJS.ProcessEnv,
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  });

  const output = stdout.trim().split(/\r?\n/).at(-1);
  assert.ok(output);
  const result = JSON.parse(output) as { outcome: string; allowed?: boolean };
  assert.equal(
    result.outcome,
    "rejected",
    "a request that cannot be counted must not be treated as allowed",
  );
  assert.equal(result.allowed, undefined);
});

/* ----------------------------- SEC-02 ----------------------------- */

test("SEC-02: malformed reset tokens are rejected without touching the database", async () => {
  const probe = path.join(process.cwd(), "tests/support/password-reset-probe.ts");
  const stub = path.join(process.cwd(), "tests/support/stub-server-only.cjs");
  const tripwire = path.join(process.cwd(), "tests/support/no-network.cjs");

  const { stdout, stderr } = await run(process.execPath, ["--import", "tsx", probe], {
    cwd: process.cwd(),
    // No DATABASE_URL on purpose: any query would reject, and the tripwire
    // turns any socket attempt into a hard failure.
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "development",
      NODE_OPTIONS: `--require ${stub} --require ${tripwire}`,
    } as NodeJS.ProcessEnv,
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  });

  assert.equal(stderr.includes("NETWORK_ATTEMPT"), false, "no connection may be attempted");
  assert.equal(stderr.includes("DATABASE_URL"), false, "no query may be attempted");
  const output = stdout.trim().split(/\r?\n/).at(-1);
  assert.ok(output);
  assert.deepEqual(JSON.parse(output), {
    empty: false,
    tooShort: false,
    wrongAlphabet: false,
    wrongLength: false,
    tooLong: false,
  });
});

test("SEC-02: the reset route validates the token before hashing a password", () => {
  const route = readFileSync("src/app/api/auth/email/reset/route.ts", "utf8");
  const handler = route.slice(route.indexOf("export async function POST"));
  const proof = handler.indexOf("isConsumablePasswordReset(");
  const hashing = handler.indexOf("hashPassword(");

  assert.notEqual(proof, -1, "the reset route must pre-validate the token");
  assert.notEqual(hashing, -1, "the reset route must still hash the new password");
  assert.ok(proof < hashing, "scrypt must only run for a token that can exist");
  assert.ok(
    handler.indexOf("enforceAuthRateLimit(") < proof,
    "the rate limit must run before the token probe",
  );
});

/* ----------------------------- SEC-03 ----------------------------- */

test("SEC-03: one order email cannot exceed perUserLimit across throwaway carts", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("../src/lib/db/schema");
  const { migrateDatabase } = await import("../src/lib/db/migrations");
  const { recordDemoOrder } = await import("../src/lib/db/demo-order");

  const client = new PGlite();
  const previousMode = process.env.CHECKOUT_MODE;
  const previousOrigin = process.env.APP_ORIGIN;
  process.env.CHECKOUT_MODE = "demo";
  delete process.env.APP_ORIGIN;

  try {
    await migrateDatabase({ client: client as never });
    const database = drizzle(client, { schema });
    const [category] = await database.insert(schema.categories)
      .values({ slug: "sec-03", name: "SEC 03" }).returning();
    const [product] = await database.insert(schema.products).values({
      slug: "sec-03-code",
      name: "SEC 03 code",
      description: "test",
      priceCents: 1_000,
      categoryId: category.id,
      stock: 24,
    }).returning();
    await database.insert(schema.promoCodes).values({
      code: "GUEST10",
      discountType: "fixed_cents",
      discountValue: 100,
      perUserLimit: 1,
      isActive: true,
    });

    const shipping = (email: string) => ({
      customerName: "Guest Buyer",
      email,
      addressLine1: "",
      city: "",
      postalCode: "",
      country: "",
    });
    let sequence = 0;
    const order = async (email: string) => {
      const [cart] = await database.insert(schema.carts).values({}).returning();
      await database.insert(schema.cartItems).values({ cartId: cart.id, productId: product.id, quantity: 1 });
      sequence += 1;
      return recordDemoOrder(database, {
        cartId: cart.id,
        idempotencyKey: sequence.toString(16).padStart(64, "c"),
        promoCode: "GUEST10",
        shipping: shipping(email),
      });
    };

    const first = await order("guest@example.invalid");
    assert.equal(first.status, "recorded");

    // A brand-new cart (all a guest needs to obtain one) and a differently
    // cased duplicate address must not reset the per-buyer limit.
    const replay = await order("  Guest@Example.INVALID ");
    assert.equal(replay.status, "invalid-promo");

    // A genuinely different buyer is unaffected.
    const otherBuyer = await order("second@example.invalid");
    assert.equal(otherBuyer.status, "recorded");
  } finally {
    await client.close();
    if (previousMode === undefined) delete process.env.CHECKOUT_MODE;
    else process.env.CHECKOUT_MODE = previousMode;
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
  }
});

/* ----------------------------- SEC-04 ----------------------------- */

test("SEC-04: log fingerprints never carry SQL, bound parameters or account data", () => {
  const driverLike = Object.assign(
    new Error('Failed query: insert into "users" — Key (email)=(victim@example.invalid) already exists'),
    {
      name: "DrizzleQueryError",
      code: "23505",
      query: 'insert into "users" ("email") values ($1)',
      params: ["victim@example.invalid", "scrypt$16384$8$1$c2FsdA$ZGlnZXN0"],
    },
  );

  const fingerprint = safeErrorForLog(driverLike);
  assert.deepEqual(fingerprint, { name: "DrizzleQueryError", code: "23505" });
  const serialized = JSON.stringify(fingerprint);
  for (const secret of ["victim@example.invalid", "insert into", "scrypt$"]) {
    assert.equal(serialized.includes(secret), false, `${secret} must not be logged`);
  }

  // Unusable codes are dropped rather than echoed.
  assert.deepEqual(
    safeErrorForLog(Object.assign(new Error("x"), { name: "Error", code: "has spaces and $1" })),
    { name: "Error" },
  );
  // Non-Error throwables degrade to their type only.
  assert.deepEqual(safeErrorForLog("victim@example.invalid"), { name: "string" });
});

test("SEC-04: unexpected failures return a generic body and log no payload", async () => {
  const probe = path.join(process.cwd(), "tests/support/log-safety-probe.ts");
  const stub = path.join(process.cwd(), "tests/support/stub-server-only.cjs");
  const tripwire = path.join(process.cwd(), "tests/support/no-network.cjs");

  const { stdout, stderr } = await run(process.execPath, ["--import", "tsx", probe], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "development",
      NODE_OPTIONS: `--require ${stub} --require ${tripwire}`,
    } as NodeJS.ProcessEnv,
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  });

  assert.equal(stderr.includes("NETWORK_ATTEMPT"), false);
  assert.equal(stderr.includes("victim@example.invalid"), false);

  const output = stdout.trim().split(/\r?\n/).at(-1);
  assert.ok(output, "probe must print a result");
  const result = JSON.parse(output) as {
    status: number;
    cacheControl: string | null;
    body: string;
    logged: unknown[][];
  };

  assert.equal(result.status, 500);
  assert.equal(result.cacheControl?.includes("no-store"), true);
  assert.equal(result.body.includes("victim@example.invalid"), false);
  assert.match(result.body, /Something went wrong/);

  assert.deepEqual(result.logged, [["[api:sec-04]", { name: "DrizzleQueryError", code: "23505" }]]);
  const stream = JSON.stringify(result.logged);
  for (const secret of ["victim@example.invalid", "insert into", "scrypt$", "already exists"]) {
    assert.equal(stream.includes(secret), false, `${secret} must never be logged`);
  }
});
