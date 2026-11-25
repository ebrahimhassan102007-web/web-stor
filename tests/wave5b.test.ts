import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  blindCodeDigest,
  computeDeliveryDigest,
  deriveVaultKek,
  digestsEqual,
  normalizeVaultCode,
  openVaultSecretV2,
  resolveVaultKeyMaterial,
  rewrapVaultDek,
  sealVaultSecretV2,
  VAULT_ENVELOPE_V2,
  type VaultKeyMaterial,
} from "../src/lib/security/vault-crypto";
import { evaluateSellerGates, SELLER_GATE_HTTP_STATUS } from "../src/lib/marketplace/seller-gate";
import {
  normalizeStoreSlug,
  RESERVED_STORE_SLUGS,
  sellerApplySchema,
  sellerProductSchema,
  sellerStockImportSchema,
  splitStockInput,
  storeSlugSchema,
} from "../src/lib/marketplace/seller-validation";
import { emailRegisterSchema } from "../src/lib/security/auth-validation";
import {
  evaluatePayoutRequest,
  PAYOUT_REFUSAL_COPY,
  sellerPayoutLedger,
} from "../src/lib/marketplace/payout-policy";
import { validateEnv } from "../src/lib/env";
import { DISPUTE_REASONS, DISPUTE_REASON_COPY } from "../src/lib/marketplace/dispute-copy";

/**
 * Wave 5B / S-26 — pure policy, crypto and source invariants.
 *
 * The database-backed half (vault v2 rows, duplicate digests, shredding,
 * rotation, cross-seller BOLA and dispute refunds) runs against a real
 * PostgreSQL engine in `tests/wave5b-db.test.ts`.
 */

const SOURCE = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

const KEY_A: VaultKeyMaterial = {
  masterKeyId: "test-key-a",
  masterKey: Buffer.alloc(32, 0x11),
  pepper: Buffer.from("0123456789abcdef0123456789abcdef", "utf8"),
  source: "env",
};
const KEY_B: VaultKeyMaterial = {
  masterKeyId: "test-key-b",
  masterKey: Buffer.alloc(32, 0x22),
  pepper: Buffer.from("0123456789abcdef0123456789abcdef", "utf8"),
  source: "env",
};

/* ------------------------------------------------------------------ */
/* 1. Split-key envelope v2                                            */
/* ------------------------------------------------------------------ */

test("S-26: v2 envelopes use a per-record DEK wrapped by an HKDF-SHA512 split key", () => {
  const secret = "CODE-AAAA-BBBB-CCCC";
  const first = sealVaultSecretV2({ plaintext: secret, context: { productId: 7, orderItemId: null }, material: KEY_A });
  const second = sealVaultSecretV2({ plaintext: secret, context: { productId: 7, orderItemId: null }, material: KEY_A });

  assert.equal(first.envelopeVersion, VAULT_ENVELOPE_V2);
  assert.equal(first.kekId, "test-key-a");
  assert.ok(first.wrappedDek && first.dekIv && first.dekAuthTag, "a wrapped DEK is always stored");
  assert.notEqual(first.wrappedDek, second.wrappedDek, "every record gets its own random DEK");
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.ok(!JSON.stringify(first).includes(secret), "no plaintext is ever stored");

  assert.equal(
    openVaultSecretV2({ record: first, context: { productId: 7, orderItemId: null }, material: KEY_A }),
    secret,
  );
});

test("S-26: only the master key AND the pepper split share rebuild the KEK", () => {
  const withPepper = deriveVaultKek(KEY_A);
  const withoutPepper = deriveVaultKek({ ...KEY_A, pepper: null });
  const otherMaster = deriveVaultKek({ ...KEY_A, masterKey: Buffer.alloc(32, 0x33) });
  assert.equal(withPepper.length, 32);
  assert.notDeepEqual(withPepper, withoutPepper, "the pepper is a real second factor");
  assert.notDeepEqual(withPepper, otherMaster);

  const sealed = sealVaultSecretV2({ plaintext: "CODE-1", context: { productId: 1, orderItemId: null }, material: KEY_A });
  assert.throws(
    () => openVaultSecretV2({ record: sealed, context: { productId: 1, orderItemId: null }, material: { ...KEY_A, pepper: null } }),
    /Unsupported state|unable to authenticate|VAULT/i,
    "dropping the pepper makes the payload unreadable",
  );
});

test("S-26: AAD binds the record context, so ciphertext cannot move between rows", () => {
  const sealed = sealVaultSecretV2({
    plaintext: "CODE-TRANSPLANT",
    context: { productId: 10, orderItemId: null },
    material: KEY_A,
  });

  assert.equal(
    openVaultSecretV2({ record: sealed, context: { productId: 10, orderItemId: null }, material: KEY_A }),
    "CODE-TRANSPLANT",
  );
  for (const context of [
    { productId: 11, orderItemId: null as number | null },
    { productId: 10, orderItemId: 5 as number | null },
    { productId: 10, orderItemId: 6 as number | null },
  ]) {
    assert.throws(
      () => openVaultSecretV2({ record: sealed, context, material: KEY_A }),
      /unable to authenticate|Unsupported state/i,
      `context ${JSON.stringify(context)} must fail GCM authentication`,
    );
  }

  // A wrapped DEK is equally context-bound: moving it to another row fails.
  assert.throws(
    () =>
      openVaultSecretV2({
        record: { ...sealed, ciphertext: sealVaultSecretV2({ plaintext: "OTHER", context: { productId: 10, orderItemId: 5 }, material: KEY_A }).ciphertext },
        context: { productId: 10, orderItemId: null },
        material: KEY_A,
      }),
    /unable to authenticate|Unsupported state|VAULT/i,
  );
});

test("S-26: a foreign KEK id and tampered DEK are rejected", () => {
  const sealed = sealVaultSecretV2({ plaintext: "CODE-2", context: { productId: 2, orderItemId: null }, material: KEY_A });
  assert.throws(
    () => openVaultSecretV2({ record: sealed, context: { productId: 2, orderItemId: null }, material: KEY_B }),
    /VAULT_KEK_MISMATCH/,
  );
  assert.throws(
    () =>
      openVaultSecretV2({
        record: { ...sealed, wrappedDek: sealed.wrappedDek.slice(0, -2) + "AA" },
        context: { productId: 2, orderItemId: null },
        material: KEY_A,
      }),
    /unable to authenticate|Unsupported state|VAULT|Invalid|base64url/i,
  );
});

test("S-26: rotation re-wraps only the DEK, then the old key stops working", () => {
  const sealed = sealVaultSecretV2({ plaintext: "CODE-ROTATE", context: { productId: 3, orderItemId: 9 }, material: KEY_A });
  const rewrapped = rewrapVaultDek({ record: sealed, context: { productId: 3, orderItemId: 9 }, from: KEY_A, to: KEY_B });
  const rotated = { ...sealed, ...rewrapped };

  assert.equal(rotated.ciphertext, sealed.ciphertext, "the payload is never re-encrypted on rotation");
  assert.equal(rotated.kekId, "test-key-b");
  assert.equal(openVaultSecretV2({ record: rotated, context: { productId: 3, orderItemId: 9 }, material: KEY_B }), "CODE-ROTATE");
  assert.throws(() => openVaultSecretV2({ record: rotated, context: { productId: 3, orderItemId: 9 }, material: KEY_A }), /VAULT_KEK_MISMATCH/);
});

test("S-26: " + "blind code digests are keyed, stable and duplicate-detecting", () => {
  const digest = blindCodeDigest("  CODE-DUP-1 ", KEY_A);
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(blindCodeDigest("CODE-DUP-1", KEY_A), digest, "normalization makes whitespace irrelevant");
  assert.equal(digestsEqual(digest, blindCodeDigest("CODE-DUP-1", KEY_A)), true);
  assert.equal(digestsEqual(digest, blindCodeDigest("CODE-DUP-2", KEY_A)), false);
  assert.notEqual(blindCodeDigest("CODE-DUP-1", KEY_B), digest, "an offline brute-force needs the key");
  assert.throws(() => blindCodeDigest("", KEY_A));
  assert.throws(() => blindCodeDigest("BAD\u0000CODE", KEY_A));

  const delivery = computeDeliveryDigest(KEY_A, {
    vaultId: "11111111-1111-4111-8111-111111111111",
    context: { productId: 1, orderItemId: 2 },
    codeDigest: digest,
    preShredCiphertext: "abc",
  });
  assert.match(delivery, /^[0-9a-f]{64}$/);
  assert.notEqual(
    delivery,
    computeDeliveryDigest(KEY_A, {
      vaultId: "11111111-1111-4111-8111-111111111111",
      context: { productId: 1, orderItemId: 2 },
      codeDigest: digest,
      preShredCiphertext: "abd",
    }),
  );
});

test("S-26: code normalization is NFKC + trim only, so case-sensitive codes round-trip", () => {
  assert.equal(normalizeVaultCode("  AbC-123 "), "AbC-123");
  assert.equal(normalizeVaultCode("１２３４"), "1234");
  assert.throws(() => normalizeVaultCode("a\tb"), /Invalid fulfillment code/, "control characters are refused");
  assert.throws(() => normalizeVaultCode("   "));
  assert.throws(() => normalizeVaultCode("x".repeat(4097)));
});

/* ------------------------------------------------------------------ */
/* Vault key resolution and environment                                */
/* ------------------------------------------------------------------ */

test("S-26: production fails closed without VAULT_MASTER_KEY; development is deterministic", () => {
  assert.throws(() => resolveVaultKeyMaterial({ NODE_ENV: "production" }), /VAULT_MASTER_KEY/);
  assert.throws(
    () => resolveVaultKeyMaterial({ NODE_ENV: "production", VAULT_MASTER_KEY: "short", VAULT_MASTER_KEY_ID: "k1" }),
    /32 bytes/,
  );

  const dev1 = resolveVaultKeyMaterial({ NODE_ENV: "development" });
  const dev2 = resolveVaultKeyMaterial({});
  assert.equal(dev1.source, "development-fallback");
  assert.deepEqual(dev1.masterKey, dev2.masterKey, "development/test fallback is deterministic, never random");
  assert.equal(dev1.masterKey.length, 32);

  const real = resolveVaultKeyMaterial({
    NODE_ENV: "production",
    VAULT_MASTER_KEY: randomBytes(32).toString("hex"),
    VAULT_MASTER_KEY_ID: "prod-key-1",
  });
  assert.equal(real.source, "env");
  assert.equal(real.masterKeyId, "prod-key-1");
  assert.throws(() => resolveVaultKeyMaterial({ VAULT_KEY_PEPPER: "not-a-key" }), /VAULT_KEY_PEPPER/);

  const errors = validateEnv({ NODE_ENV: "production", DATABASE_URL: "postgres://u:p@h/db" });
  assert.ok(errors.some((error) => error.includes("VAULT_MASTER_KEY")), "boot validation names the vault key");
  assert.deepEqual(validateEnv({ NODE_ENV: "development" }), []);
});

/* ------------------------------------------------------------------ */
/* 2. Dual-role registration                                           */
/* ------------------------------------------------------------------ */

test("S-26: customer registration stays a zero-extra-field one-step signup", () => {
  const parsed = emailRegisterSchema.safeParse({
    displayName: "Buyer One",
    email: "buyer@example.com",
    password: "correct-horse-battery-staple",
    locale: "en",
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.accountType, "customer", "the default signup is a plain customer");
  }

  // The existing Playwright selectors keep posting exactly this shape.
  const source = SOURCE("src/app/api/auth/email/register/route.ts");
  assert.match(source, /accountType === "merchant"/);
  assert.match(source, /createSellerApplication/);
  assert.match(source, /guardMutatingRequest/);
});

test("S-26: merchant signup requires store details and a normalized slug", () => {
  assert.equal(normalizeStoreSlug("  My   Game Store!!  "), "my-game-store");
  assert.equal(normalizeStoreSlug("UPPER_case"), "upper-case");
  assert.equal(normalizeStoreSlug(normalizeStoreSlug("Hello -- World")), "hello-world");

  const good = sellerApplySchema.safeParse({
    storeName: "Cairo Keys",
    storeSlug: "Cairo  Keys",
    storeDescription: "Digital keys",
    phone: "+20 100 000 0000",
    country: "eg",
    termsAccepted: true,
  });
  assert.equal(good.success, true);
  if (good.success) {
    assert.equal(good.data.storeSlug, "cairo-keys");
    assert.equal(good.data.country, "EG");
  }

  for (const bad of [
    { ...good.success ? good.data : {}, storeSlug: "a" },
    { storeName: "", storeSlug: "ok-slug", phone: "+201000000000", country: "EG", termsAccepted: true },
    { storeName: "Shop", storeSlug: "ok-slug", phone: "abc", country: "EG", termsAccepted: true },
    { storeName: "Shop", storeSlug: "ok-slug", phone: "+201000000000", country: "Egypt", termsAccepted: true },
    { storeName: "Shop", storeSlug: "ok-slug", phone: "+201000000000", country: "EG", termsAccepted: false },
  ]) {
    assert.equal(sellerApplySchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
  assert.equal(storeSlugSchema.safeParse("admin").success, true, "reserved words are a service-level check");
  assert.ok(RESERVED_STORE_SLUGS.has("admin"));
});

test("S-26: merchant listings are integer cents, bounded and target-typed", () => {
  const base = {
    name: "Steam 20 USD",
    description: "A digital Steam wallet code delivered instantly.",
    priceCents: 1999,
    categoryId: 1,
  };
  assert.equal(sellerProductSchema.safeParse(base).success, true);
  assert.equal(sellerProductSchema.safeParse({ ...base, priceCents: 19.99 }).success, false, "floats are refused");
  assert.equal(sellerProductSchema.safeParse({ ...base, priceCents: 0 }).success, false);
  assert.equal(sellerProductSchema.safeParse({ ...base, priceCents: 10_000_001 }).success, false);
  assert.equal(sellerProductSchema.safeParse({ ...base, inputType: "shell" }).success, false);

  assert.deepEqual(splitStockInput("A-1\nB-2, C-3;;\n\n"), ["A-1", "B-2", "C-3"]);
  assert.equal(sellerStockImportSchema.safeParse({ raw: "A-1\nB-2" }).success, true);
  assert.equal(sellerStockImportSchema.safeParse({ raw: "   " }).success, false);
  assert.equal(sellerStockImportSchema.safeParse({ codes: [] }).success, false);
});

/* ------------------------------------------------------------------ */
/* 3. Merchant security gate                                           */
/* ------------------------------------------------------------------ */

test("S-26: every seller gate must pass and the refusal is a bilingual 403", () => {
  const pending = evaluateSellerGates({ emailVerified: true, twoFactorEnabled: true, sellerStatus: "pending" });
  assert.equal(pending.ready, false);
  assert.equal(pending.blocker, "SELLER_NOT_APPROVED");
  assert.ok(pending.blockerEn.length > 0 && pending.blockerAr.length > 0);
  assert.deepEqual(
    pending.checks.map((check) => check.key),
    ["email", "two-factor", "approval"],
  );

  assert.equal(evaluateSellerGates({ emailVerified: false, twoFactorEnabled: true, sellerStatus: "approved" }).blocker, "EMAIL_UNVERIFIED");
  assert.equal(evaluateSellerGates({ emailVerified: true, twoFactorEnabled: false, sellerStatus: "approved" }).blocker, "TWO_FACTOR_REQUIRED");
  assert.equal(evaluateSellerGates({ emailVerified: true, twoFactorEnabled: true, sellerStatus: "suspended" }).ready, false);

  const ready = evaluateSellerGates({ emailVerified: true, twoFactorEnabled: true, sellerStatus: "approved" });
  assert.equal(ready.ready, true);
  assert.equal(ready.blocker, null);
  assert.equal(SELLER_GATE_HTTP_STATUS, 403);

  // The gate is enforced in the API, not only rendered in the UI.
  for (const route of [
    "src/app/api/seller/products/route.ts",
    "src/app/api/seller/products/[productId]/route.ts",
    "src/app/api/seller/products/[productId]/stock/route.ts",
  ]) {
    assert.match(SOURCE(route), /requireLiveSeller\(\)/, route);
    assert.match(SOURCE(route), /guardMutatingRequest/, route);
  }
});

/* ------------------------------------------------------------------ */
/* 4. Escrow, disputes and payout policy                               */
/* ------------------------------------------------------------------ */

test("S-26: an open dispute freezes the seller's escrow immediately", () => {
  const lines = [
    { orderId: "o1", orderStatus: "paid", unitPriceCents: 1000, quantity: 1, currency: "USD", openDispute: false },
    { orderId: "o2", orderStatus: "fulfilled", unitPriceCents: 2500, quantity: 2, currency: "USD", openDispute: true },
    { orderId: "o3", orderStatus: "cancelled", unitPriceCents: 999, quantity: 1, currency: "USD", openDispute: false },
  ];
  const ledger = sellerPayoutLedger(lines);
  assert.equal(ledger.grossSalesCents, 1000 + 5000);
  assert.equal(ledger.commissionCents, 100 + 500);
  assert.equal(ledger.sellerEntitlementCents, 900 + 4500);
  assert.equal(ledger.escrowHeldCents, 4500);
  assert.equal(ledger.payoutEligibleCents, 900);
  assert.equal(ledger.escrowOrderCount, 1);
  assert.equal(ledger.excludedOrderCount, 1);

  const base = {
    sellerStatus: "approved" as const,
    availableCents: 900,
    reservedCents: 0,
    method: "bank_transfer" as const,
    hasOpenRequest: false,
    payoutsEnabled: true,
  };
  assert.deepEqual(evaluatePayoutRequest({ ...base, amountCents: 900 }), { allowed: true, amountCents: 900, method: "bank_transfer" });
  assert.deepEqual(
    evaluatePayoutRequest({ ...base, amountCents: 901, escrowHeldCents: 4500, availableCents: 5400 }),
    { allowed: false, code: "ESCROW_HOLD_ACTIVE" },
  );
  assert.deepEqual(evaluatePayoutRequest({ ...base, amountCents: 900, payoutBlocked: true }), { allowed: false, code: "PAYOUT_BLOCKED" });
  assert.ok(PAYOUT_REFUSAL_COPY.PAYOUT_BLOCKED.en && PAYOUT_REFUSAL_COPY.ESCROW_HOLD_ACTIVE.ar);
});

test("S-26: dispute reasons are bilingual and closed resolutions require a note", () => {
  for (const reason of DISPUTE_REASONS) {
    assert.ok(DISPUTE_REASON_COPY[reason].en.length > 0, reason);
    assert.ok(DISPUTE_REASON_COPY[reason].ar.length > 0, reason);
  }
  const migration = SOURCE("drizzle/0010_marketplace_sellers_disputes_and_vault_v2.sql");
  assert.match(migration, /order_disputes_open_order_idx/);
  assert.match(migration, /WHERE "order_disputes"\."status" = 'open'/);
  assert.match(migration, /order_disputes_closed_has_resolution/);
  assert.match(migration, /fulfillment_vault_code_digest_idx/);
  assert.match(migration, /fulfillment_vault_shred_is_permanent/);
});

/* ------------------------------------------------------------------ */
/* 5. Owner CLI, admin elimination and source invariants               */
/* ------------------------------------------------------------------ */

test("S-26: owner CLI gains sellers, disputes and vault rotate-keys (no web admin)", () => {
  const source = SOURCE("scripts/owner-ops.ts");
  for (const command of ['case "sellers"', 'case "disputes"', 'case "vault"']) {
    assert.ok(source.includes(command), command);
  }
  assert.match(source, /sellers approve <sellerId>/);
  assert.match(source, /disputes resolve <disputeId>/);
  assert.match(source, /rotateVaultKeys/);
  assert.match(source, /resolveOrderDisputeInTransaction/);
  assert.match(source, /assertCliContext/);
  assert.match(SOURCE("package.json"), /"ops": "tsx scripts\/owner-ops.ts"/);
});

test("S-26: /admin is still an unconditional 404 with private, no-store", () => {
  assert.equal(existsSync(path.join(process.cwd(), "src/app/admin")), false, "there is no web admin tree");
  const proxy = SOURCE("src/proxy.ts");
  assert.match(proxy, /classifyRequestPath/);
  assert.match(proxy, /status: 404/);
  assert.match(proxy, /private, no-store, no-cache, must-revalidate/);
  assert.match(proxy, /"\/seller"/, "the merchant portal is a private, uncacheable page");
});

test("S-26: buyer and merchant surfaces never accept a client-supplied seller id", () => {
  const stock = SOURCE("src/app/api/seller/products/[productId]/stock/route.ts");
  assert.match(stock, /requireLiveSeller/);
  assert.doesNotMatch(stock, /sellerId\s*[:=]\s*(body|parsed\.data)/, "seller id can only come from the session");

  const apply = SOURCE("src/app/api/seller/apply/route.ts");
  assert.match(apply, /guardMutatingRequest/);
  assert.match(apply, /userId: user\.id/);

  const disputes = SOURCE("src/app/api/account/orders/[orderId]/dispute/route.ts");
  assert.match(disputes, /guardMutatingRequest/);
  assert.match(disputes, /userId: user\.id/);

  const shred = SOURCE("src/app/api/account/orders/[orderId]/shred/route.ts");
  assert.match(shred, /guardMutatingRequest/);
  assert.match(shred, /userId: user\.id/);

  const store = SOURCE("src/lib/marketplace/seller-store.ts");
  assert.match(store, /eq\(products\.sellerId, input\.sellerId\)/, "product reads are seller-scoped in SQL");
});
