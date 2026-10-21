import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fetchCartSummary } from "../src/lib/client/cart-load";
import { assertLocalResetAllowed, assertNotProduction } from "../src/lib/db/seed-safety";
import { getClientKey } from "../src/lib/security/client-ip";
import { deleteCatalogAndDemoOrders, seedMissingCatalog } from "../src/lib/db/seed-catalog";
import { checkoutSchema } from "../src/lib/validation";

const root = process.cwd();

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("anonymous success receipt does not read or render customer details or delivery codes", async () => {
  const page = await readFile(path.join(root, "src/app/checkout/success/page.tsx"), "utf8");
  const catalog = await readFile(path.join(root, "src/lib/catalog.ts"), "utf8");
  const dictionary = await readFile(path.join(root, "src/lib/i18n/dictionary.ts"), "utf8");

  assert.match(page, /orderExistsByNumber/);
  for (const privateField of ["customerName", "addressLine1", "postalCode", "deliveryCode", "email"]) {
    assert.doesNotMatch(page, new RegExp(`\\b${privateField}\\b`));
  }
  const lookup = catalog.slice(catalog.indexOf("export async function orderExistsByNumber"));
  assert.match(lookup, /select\(\{ id: orders\.id \}\)/);
  assert.doesNotMatch(lookup, /orderItems|customerName|addressLine1|deliveryCode/);
  assert.match(dictionary, /does not send confirmation emails/);
});

test("client-supplied forwarded IP is ignored unless trusted proxy mode is explicitly enabled", () => {
  const req = new Request("https://store.test/api", {
    headers: { "x-forwarded-for": "203.0.113.99, 10.0.0.1" },
  });
  assert.equal(getClientKey(req, false), "untrusted-proxy");
  assert.equal(getClientKey(req, true), "203.0.113.99");
  assert.equal(getClientKey(new Request("https://store.test/api"), true), "unknown-client");
});

test("seed and reset reject production, and reset requires explicit local confirmation", () => {
  assert.throws(() => assertNotProduction({ NODE_ENV: "production" }), /disabled in production/);
  assert.throws(() => assertLocalResetAllowed({ NODE_ENV: "production", RESET_LOCAL_CATALOG: "YES" }), /disabled in production/);
  assert.throws(() => assertLocalResetAllowed({ NODE_ENV: "development" }), /RESET_LOCAL_CATALOG=YES/);
  assert.throws(
    () => assertLocalResetAllowed({ NODE_ENV: "development", RESET_LOCAL_CATALOG: "YES", DATABASE_URL: "postgres://test/db" }),
    /embedded PGlite/,
  );
  assert.doesNotThrow(() => assertLocalResetAllowed({ NODE_ENV: "development", RESET_LOCAL_CATALOG: "YES" }));
});

test("catalog seeding function itself refuses production even if called outside the CLI", async () => {
  const env = process.env as unknown as Record<string, string | undefined>;
  const previous = env.NODE_ENV;
  env.NODE_ENV = "production";
  try {
    await assert.rejects(seedMissingCatalog({} as never), /disabled in production/);
    await assert.rejects(deleteCatalogAndDemoOrders({} as never), /disabled in production/);
  } finally {
    if (previous === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous;
  }
});

test("checkout input cannot supply authoritative prices or totals", () => {
  const parsed = checkoutSchema.safeParse({
    customerName: "Test Customer",
    email: "test@example.invalid",
    priceCents: 1,
    totalCents: 1,
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal("priceCents" in parsed.data, false);
    assert.equal("totalCents" in parsed.data, false);
  }
});

test("cart loader rejects HTTP failures and API-level failures, including valid JSON with ok:false", async () => {
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
  assert.deepEqual(
    await fetchCartSummary(() => Promise.resolve(response(200, { ok: true, data: { items: [] } }))),
    { items: [] },
  );
});

test("cart and checkout display retry paths for failed initial loads", async () => {
  for (const file of ["src/app/cart/page.tsx", "src/app/checkout/page.tsx"]) {
    const page = await readFile(path.join(root, file), "utf8");
    assert.match(page, /fetchCartSummary/);
    assert.match(page, /role="alert"/);
    assert.match(page, /onClick=\{\(\) => void load\(\)\}/);
  }
});

test("checkout remains server-priced and stock-decrement guarded", async () => {
  const route = await readFile(path.join(root, "src/app/api/checkout/route.ts"), "utf8");
  assert.match(route, /priceCents: products\.priceCents/);
  assert.match(route, /gte\(products\.stock, line\.quantity\)/);
  assert.match(route, /sql`\$\{products\.stock\} - \$\{line\.quantity\}`/);
  assert.doesNotMatch(route, /parsed\.data\.(price|total|subtotal)/);
});
