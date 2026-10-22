import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  CHECKOUT_DISABLED_MESSAGE,
  CHECKOUT_DISABLED_STATUS,
  DEMO_ORDER_STATUS,
  isPaidOrConfirmedStatus,
  PAID_OR_CONFIRMED_STATUSES,
  resolveCheckoutMode,
} from "../src/lib/checkout-policy";
import { orders } from "../src/lib/db/schema";

const run = promisify(execFile);
const root = process.cwd();
const probe = path.join(root, "tests/support/checkout-probe.ts");
const stub = path.join(root, "tests/support/stub-server-only.cjs");

/** Point at a closed port: any database access fails loudly and immediately. */
const UNREACHABLE_DATABASE_URL = "postgres://probe:probe@127.0.0.1:1/webstor_test";

type ProbeResult = {
  status: number;
  body: string;
  stdout: string;
  stderr: string;
  exitCode: number;
};

async function runProbe(env: Record<string, string>): Promise<ProbeResult> {
  const childEnv: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require ${stub}`.trim(),
    APP_ORIGIN: "https://store.test",
    SESSION_SECRET: "probe-only-session-secret-0123456789",
    DATABASE_URL: UNREACHABLE_DATABASE_URL,
    ...env,
  };

  try {
    const { stdout, stderr } = await run(process.execPath, ["--import", "tsx", probe], {
      cwd: root,
      env: childEnv as NodeJS.ProcessEnv,
      timeout: 60_000,
    });
    const parsed = JSON.parse(stdout) as { status: number; body: string };
    return { ...parsed, stdout, stderr, exitCode: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number };
    let parsed = { status: -1, body: "" };
    try {
      parsed = JSON.parse(failure.stdout ?? "{}") as { status: number; body: string };
    } catch {
      // fall through with the -1 sentinel so the assertion message is useful
    }
    return {
      ...parsed,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      exitCode: failure.code ?? 1,
    };
  }
}

/* ------------------------------- Policy -------------------------------- */

test("production checkout is disabled while no payment provider exists", () => {
  assert.equal(resolveCheckoutMode({ NODE_ENV: "production" }), "disabled");
  assert.equal(resolveCheckoutMode({ NODE_ENV: "development" }), "demo");
  assert.equal(resolveCheckoutMode({ NODE_ENV: "test" }), "demo");
  assert.equal(resolveCheckoutMode({}), "demo");

  assert.equal(CHECKOUT_DISABLED_STATUS, 503);
  assert.match(CHECKOUT_DISABLED_MESSAGE, /unavailable/i);
  // Non-sensitive: no env names, hosts, stack traces or internal detail.
  for (const leak of ["DATABASE_URL", "http", "/api", "NODE_ENV", "Error"]) {
    assert.equal(CHECKOUT_DISABLED_MESSAGE.includes(leak), false, leak);
  }
});

test("demo orders never use a paid or confirmed status", () => {
  assert.equal(DEMO_ORDER_STATUS, "demo-unpaid");
  assert.equal(isPaidOrConfirmedStatus(DEMO_ORDER_STATUS), false);
  for (const paid of PAID_OR_CONFIRMED_STATUSES) {
    assert.equal(isPaidOrConfirmedStatus(paid), true, paid);
  }
  // The schema column is varchar(24); the demo status must fit unchanged.
  assert.ok(DEMO_ORDER_STATUS.length <= 24);
  assert.equal(orders.status.columnType, "PgVarchar");
  assert.equal(orders.status.getSQLType(), "varchar(24)");
});

/* -------------------------- Guard ordering ----------------------------- */

test("the production guard is the first statement and precedes any data access", async () => {
  const route = await readFile(
    path.join(root, "src/app/api/checkout/route.ts"),
    "utf8",
  );
  const handlerStart = route.indexOf("export async function POST");
  assert.ok(handlerStart > 0, "POST handler must exist");

  const guardIndex = route.indexOf("resolveCheckoutMode()", handlerStart);
  assert.ok(guardIndex > handlerStart, "guard must be inside the handler");
  assert.ok(
    route.indexOf("CHECKOUT_DISABLED_STATUS", guardIndex) > guardIndex,
    "guard must return the 503 status",
  );

  // Everything that can read cookies, parse the body or touch the database
  // must come *after* the guard in the same function.
  for (const later of [
    "verifySameOrigin(req)",
    "rateLimit(",
    "req.json()",
    "checkoutSchema.safeParse",
    "getExistingCartId()",
    "recordDemoOrder(",
  ]) {
    const index = route.indexOf(later, handlerStart);
    assert.ok(index > guardIndex, `${later} must run after the production guard`);
  }

  // No direct database import/usage is allowed in the route at all: all
  // mutations live behind recordDemoOrder (and never in production).
  assert.doesNotMatch(route, /tx\.(insert|update|delete)/);
  assert.doesNotMatch(route, /\.delete\(carts\)/);
  assert.doesNotMatch(route, /stock\} - \$/);
});

test("demo order recording never decrements stock or destroys the cart", async () => {
  const demoOrder = await readFile(
    path.join(root, "src/lib/db/demo-order.ts"),
    "utf8",
  );
  assert.match(demoOrder, /status: DEMO_ORDER_STATUS/);
  assert.doesNotMatch(demoOrder, /\.update\(products\)/);
  assert.doesNotMatch(demoOrder, /delete\(carts\)/);
  assert.doesNotMatch(demoOrder, /sql`/);
  assert.match(demoOrder, /priceCents: products\.priceCents/);
  assert.doesNotMatch(demoOrder, /shipping\.(priceCents|totalCents|subtotalCents)/);
});

test("the receipt heading does not claim payment or a confirmed order", async () => {
  const page = await readFile(
    path.join(root, "src/app/checkout/success/page.tsx"),
    "utf8",
  );
  assert.doesNotMatch(page, /Order <span[^>]*>Confirmed/);
  assert.doesNotMatch(page, /title: "Order Confirmed"/);
  assert.match(page, /Demo order <span className="text-success">recorded<\/span>/);
  assert.match(page, /no payment was processed/i);
  assert.match(page, /no stock was reserved/i);
  assert.match(page, /no confirmation email was sent/i);
});

/* -------------------- Dynamic proof: no mutation in prod ---------------- */

test("production checkout returns 503 before any database mutation is attempted", async () => {
  const result = await runProbe({
    NODE_ENV: "production",
    // A closed port: if the handler performs even one query, the request fails
    // with a connection error instead of a clean 503.
    DATABASE_URL: UNREACHABLE_DATABASE_URL,
  });

  assert.equal(result.exitCode, 0, `probe crashed: ${result.stderr}`);
  assert.equal(result.status, CHECKOUT_DISABLED_STATUS);

  const body = JSON.parse(result.body) as { ok: boolean; error: string };
  assert.equal(body.ok, false);
  assert.equal(body.error, CHECKOUT_DISABLED_MESSAGE);

  // No database/cookie machinery ran, so nothing was logged and nothing leaked.
  assert.equal(result.stderr.trim(), "", `expected no error output, got: ${result.stderr}`);
  for (const leak of ["ECONNREFUSED", "127.0.0.1", "postgres", "password"]) {
    assert.equal(result.body.includes(leak), false, leak);
  }
});

test("without the guard the same request does reach data access (control)", async () => {
  // Same unreachable database, but development mode: the handler proceeds past
  // the guard into the cart/cookie path and fails there. This proves the 503
  // above is caused by the guard returning early, not by the environment.
  const result = await runProbe({
    NODE_ENV: "development",
    DATABASE_URL: UNREACHABLE_DATABASE_URL,
  });

  assert.equal(result.exitCode, 0, `probe crashed: ${result.stderr}`);
  assert.notEqual(result.status, 503);
  assert.equal(result.status, 500);
  assert.match(result.stderr, /api:checkout/);
  const body = JSON.parse(result.body) as { ok: boolean; error: string };
  assert.equal(body.ok, false);
  // Generic client error: no internals leak even on the failure path.
  assert.doesNotMatch(body.error, /ECONNREFUSED|postgres|127\.0\.0\.1/i);
});
