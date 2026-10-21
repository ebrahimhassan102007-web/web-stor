import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fetchCartSummary } from "../src/lib/client/cart-load";
import { resolveDatabaseUrl } from "../src/lib/db/config";
import { assertNotProduction } from "../src/lib/db/seed-safety";
import { getClientKey } from "../src/lib/security/client-ip";
import { configuredOrigin, isAllowedOrigin } from "../src/lib/security/origin";
import {
  newOrderNumber,
  ORDER_REFERENCE_ALPHABET,
  ORDER_REFERENCE_ENTROPY_BITS,
  ORDER_REFERENCE_LENGTH,
  randomReferenceChars,
} from "../src/lib/order-number";
import { checkoutSchema, orderNumberSchema } from "../src/lib/validation";

const root = process.cwd();

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(root, relativePath), "utf8");
}

/* ----------------------------- Order privacy ---------------------------- */

test("anonymous order receipt reads and renders no personal or order data", async () => {
  const page = await source("src/app/checkout/success/page.tsx");
  const catalog = await source("src/lib/catalog.ts");

  // Only the existence check may be used by the page.
  assert.match(page, /orderExistsByNumber/);
  // No order record is read at all, so no private field can be rendered.
  assert.doesNotMatch(page, /getOrderByNumber/);
  assert.doesNotMatch(page, /\border\.[A-Za-z]/);

  for (const privateField of [
    "customerName",
    "addressLine1",
    "addressLine2",
    "postalCode",
    "subtotalCents",
    "totalCents",
  ]) {
    assert.doesNotMatch(
      page,
      new RegExp(`\\b${privateField}\\b`),
      `success page must not reference ${privateField}`,
    );
  }

  const lookup = catalog.slice(
    catalog.indexOf("export async function orderExistsByNumber"),
  );
  assert.match(lookup, /select\(\{ id: orders\.id \}\)/);
  assert.doesNotMatch(
    lookup,
    /orderItems|select\(\)|customerName|addressLine1|deliveryCode/,
  );
});

test("demo receipt states that no email is sent and no payment is processed", async () => {
  const page = await source("src/app/checkout/success/page.tsx");
  assert.match(page, /no\s+confirmation email was sent/i);
  assert.match(page, /no payment was processed/i);
  assert.doesNotMatch(page, /sent to/i);
  assert.doesNotMatch(page, /confirmation was sent/i);
});

/* -------------------------- Order reference entropy ---------------------- */

test("order references are WS- plus 12 unbiased base-30 characters", () => {
  assert.equal(ORDER_REFERENCE_ALPHABET.length, 30);
  assert.equal(ORDER_REFERENCE_LENGTH, 12);

  // 12 * log2(30) ≈ 58.88 bits, matching the documented claim.
  assert.ok(Math.abs(ORDER_REFERENCE_ENTROPY_BITS - 58.88) < 0.01);

  const sample = newOrderNumber();
  assert.match(sample, /^WS-[A-Z0-9]{12}$/);
  assert.equal(orderNumberSchema.safeParse(sample).success, true);

  for (const char of sample.slice(3)) {
    assert.ok(ORDER_REFERENCE_ALPHABET.includes(char));
  }
  for (const ambiguous of ["I", "L", "O", "U", "0", "1"]) {
    assert.equal(ORDER_REFERENCE_ALPHABET.includes(ambiguous), false);
  }
});

test("order references reject the modulo-biased byte range instead of folding it", () => {
  // 240..255 would make the first 16 alphabet characters more likely if the
  // byte were reduced with `% 30`; rejection sampling must skip them.
  const bytes = Buffer.from([240, 241, 255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  assert.equal(
    randomReferenceChars(3, () => bytes),
    `${ORDER_REFERENCE_ALPHABET[0]}${ORDER_REFERENCE_ALPHABET[1]}${ORDER_REFERENCE_ALPHABET[2]}`,
  );
});

test("order references are unique across many draws and use the whole alphabet", () => {
  const seen = new Set<string>();
  const chars = new Set<string>();
  for (let i = 0; i < 5000; i += 1) {
    const reference = newOrderNumber();
    assert.match(reference, /^WS-[A-Z0-9]{12}$/);
    seen.add(reference);
    for (const char of reference.slice(3)) chars.add(char);
  }
  assert.equal(seen.size, 5000, "generated references must not collide");
  assert.equal(chars.size, ORDER_REFERENCE_ALPHABET.length);
});

/* ------------------------- Production fail-closed ----------------------- */

test("database configuration fails closed: there is no local/embedded fallback", () => {
  // Missing or unusable DATABASE_URL must abort startup in every environment,
  // including production, instead of falling back to an embedded database.
  assert.throws(() => resolveDatabaseUrl({}), /DATABASE_URL/);
  assert.throws(() => resolveDatabaseUrl({ NODE_ENV: "development" }), /DATABASE_URL/);
  assert.throws(
    () => resolveDatabaseUrl({ NODE_ENV: "production" }),
    /no embedded or fallback database/,
  );
  assert.throws(
    () => resolveDatabaseUrl({ NODE_ENV: "production", DATABASE_URL: "not-a-url" }),
    /not a valid connection URL/,
  );
  assert.throws(
    () => resolveDatabaseUrl({ NODE_ENV: "production", DATABASE_URL: "mysql://db/webstor" }),
    /postgres/,
  );
  assert.throws(
    () => resolveDatabaseUrl({ NODE_ENV: "production", DATABASE_URL: "postgres://" }),
    /connection URL|database host/,
  );

  // A normal PostgreSQL URL is accepted; localhost is just a PostgreSQL
  // connection (dev server or sidecar), never a different database engine.
  for (const url of [
    "postgres://user:pass@localhost:5432/webstor",
    "postgres://user:pass@db.example.com:5432/webstor",
  ]) {
    assert.equal(resolveDatabaseUrl({ NODE_ENV: "production", DATABASE_URL: url }), url);
    assert.equal(resolveDatabaseUrl({ NODE_ENV: "development", DATABASE_URL: url }), url);
  }
});

test("the database module resolves its URL through the validating helper", async () => {
  const index = await source("src/lib/db/index.ts");
  assert.match(index, /resolveDatabaseUrl\(\)/);
  assert.doesNotMatch(index, /pglite|PGlite|embedded-postgres/i);
});

/* -------------------------------- Seeding ------------------------------- */

test("catalog seeding refuses production outright", () => {
  assert.throws(() => assertNotProduction({ NODE_ENV: "production" }), /disabled in production/);
  assert.doesNotThrow(() => assertNotProduction({ NODE_ENV: "development" }));
  assert.doesNotThrow(() => assertNotProduction({ NODE_ENV: "test" }));
});

test("seed helper has no destructive statements and the seed script is additive", async () => {
  const helper = await source("src/lib/db/seed-catalog.ts");
  assert.doesNotMatch(helper, /\.delete\(|TRUNCATE|DROP /i);
  assert.match(helper, /onConflictDoNothing/);

  const script = await source("scripts/seed.ts");
  assert.doesNotMatch(script, /\.delete\(/);
  assert.match(script, /seedMissingCatalog/);
  assert.match(script, /resolveDatabaseUrl/);
});

/* ------------------------------ Origin checks --------------------------- */

test("configured origin accepts only bare http(s) origins", () => {
  assert.equal(configuredOrigin({}), null);
  assert.equal(
    configuredOrigin({ APP_ORIGIN: "https://store.example.com" }),
    "https://store.example.com",
  );
  assert.equal(
    configuredOrigin({ APP_ORIGIN: "https://store.example.com/" }),
    "https://store.example.com",
  );
  for (const invalid of [
    "https://store.example.com/path",
    "https://store.example.com/?q=1",
    "https://store.example.com/#fragment",
    "https://user:pass@store.example.com",
    "javascript:alert(1)",
    "store.example.com",
  ]) {
    assert.equal(configuredOrigin({ APP_ORIGIN: invalid }), null, invalid);
  }
});

test("origin comparison is exact and rejects spoofed or malformed origins", () => {
  const expected = "https://store.example.com";
  assert.equal(isAllowedOrigin("https://store.example.com", expected), true);
  assert.equal(isAllowedOrigin("https://store.example.com:8443", expected), false);
  assert.equal(isAllowedOrigin("http://store.example.com", expected), false);
  assert.equal(isAllowedOrigin("https://evil.example.net", expected), false);
  assert.equal(isAllowedOrigin("https://store.example.com.evil.test", expected), false);
  assert.equal(isAllowedOrigin("null", expected), false);
  assert.equal(isAllowedOrigin(null, expected), false);
  assert.equal(isAllowedOrigin("https://store.example.com", null), false);
});

test("CSRF check never trusts X-Forwarded-Host and fails closed in production", async () => {
  const csrf = await source("src/lib/security/csrf.ts");
  assert.doesNotMatch(csrf, /headers\.get\(\s*["'`]x-forwarded-host/i);
  assert.match(csrf, /configuredOrigin/);
  assert.match(csrf, /NODE_ENV === "production"/);
});

/* ------------------------------- Client IP ------------------------------ */

test("client-supplied forwarded IP is ignored unless trusted proxy mode is enabled", () => {
  const spoofed = new Request("https://store.test/api", {
    headers: { "x-forwarded-for": "203.0.113.99, 10.0.0.1" },
  });
  assert.equal(getClientKey(spoofed, false), "untrusted-proxy");
  assert.equal(getClientKey(spoofed, true), "203.0.113.99");

  assert.equal(getClientKey(new Request("https://store.test/api"), true), "unknown-client");
  assert.equal(
    getClientKey(
      new Request("https://store.test/api", { headers: { "x-forwarded-for": "not-an-ip" } }),
      true,
    ),
    "unknown-client",
  );
  assert.equal(
    getClientKey(
      new Request("https://store.test/api", { headers: { "x-forwarded-for": "2001:db8::1" } }),
      true,
    ),
    "2001:db8::1",
  );
});

test("rate-limit identity honours only an explicitly trusted proxy header", async () => {
  const rateLimit = await source("src/lib/security/rate-limit.ts");
  assert.match(rateLimit, /TRUST_PROXY_IP_HEADERS === "true"/);
  assert.match(rateLimit, /getClientKey/);
  assert.match(rateLimit, /multi-instance|multiple instances/i);
});

/* ------------------------------ Cart loading ---------------------------- */

test("cart loader rejects HTTP failures, ok:false bodies, and missing data", async () => {
  await assert.rejects(
    fetchCartSummary(() => Promise.resolve(response(500, { ok: false, error: "unavailable" }))),
    /unavailable/,
  );
  await assert.rejects(
    fetchCartSummary(() => Promise.resolve(response(200, { ok: false, error: "cart unavailable" }))),
    /cart unavailable/,
  );
  await assert.rejects(
    fetchCartSummary(() => Promise.resolve(response(200, { ok: true }))),
    /Unable to load cart/,
  );
  await assert.rejects(
    fetchCartSummary(() => Promise.resolve(new Response("<html>oops</html>", { status: 200 }))),
    /Unable to load cart/,
  );
  assert.deepEqual(
    await fetchCartSummary(() => Promise.resolve(response(200, { ok: true, data: { items: [] } }))),
    { items: [] },
  );
});

test("cart and checkout pages use the strict loader and expose a retry path", async () => {
  for (const file of ["src/app/cart/page.tsx", "src/app/checkout/page.tsx"]) {
    const page = await source(file);
    assert.match(page, /fetchCartSummary/, file);
    assert.match(page, /role="alert"/, file);
    assert.match(page, /onClick=\{\(\) => void load\(\)\}/, file);
    assert.doesNotMatch(page, /body\?\.ok\) setCart/, file);
  }
});

/* ------------------------------ Checkout API ---------------------------- */

test("checkout delegates to the demo recorder: no client prices, no codes, no inventory writes", async () => {
  const route = await source("src/app/api/checkout/route.ts");
  assert.match(route, /recordDemoOrder\(/);
  assert.match(route, /newOrderNumber|recordDemoOrder/);
  assert.doesNotMatch(route, /randomBytes/);
  assert.doesNotMatch(route, /parsed\.data\.(price|total|subtotal)/);
  assert.doesNotMatch(route, /deliveryCode|topUp|playerId|region/i);
  // Pricing and the (non-)treatment of stock live in one reviewed module; the
  // demo recorder never decrements or deletes anything but its own rows.
  const demoOrder = await source("src/lib/db/demo-order.ts");
  assert.match(demoOrder, /priceCents: products\.priceCents/);
  assert.match(demoOrder, /newOrderNumber\(\)/);
  assert.match(demoOrder, /status: DEMO_ORDER_STATUS/);
  assert.doesNotMatch(demoOrder, /\.update\(products\)|\.delete\(carts\)/);
});

test("cart addition uses a row lock and an atomic conflict expression", async () => {
  const operations = await source("src/lib/db/cart-operations.ts");
  assert.match(operations, /for\("update"\)/);
  assert.match(operations, /onConflictDoUpdate/);
  assert.match(operations, /LEAST\(/);
  assert.match(operations, /MAX_QTY_PER_LINE = 99/);

  const route = await source("src/app/api/cart/items/route.ts");
  assert.match(route, /addToCartLine/);
});

test("checkout input cannot supply authoritative prices or totals", () => {
  const parsed = checkoutSchema.safeParse({
    customerName: "Test Customer",
    email: "test@example.invalid",
    addressLine1: "1 Test Street",
    city: "Testville",
    postalCode: "TE1 1ST",
    country: "Testland",
    priceCents: 1,
    totalCents: 1,
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal("priceCents" in parsed.data, false);
    assert.equal("totalCents" in parsed.data, false);
  }
});
