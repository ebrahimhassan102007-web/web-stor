import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.INVENTORY_SECRET ??=
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */
describe("money", () => {
  it("formats integer cents as EGP (Arabic-Indic digits)", async () => {
    const { formatCents } = await import("@/lib/money");
    expect(formatCents(52900)).toContain("ج.م");
    expect(formatCents(52900)).toContain("\u0665\u0662\u0669"); // ٥٢٩
    expect(formatCents(0)).toBeTruthy();
  });

  it("computes discount percent only when original > price", async () => {
    const { discountPercent } = await import("@/lib/money");
    expect(discountPercent(8000, 10000)).toBe(20);
    expect(discountPercent(10000, 10000)).toBeNull();
    expect(discountPercent(10000, null)).toBeNull();
    expect(discountPercent(10000, 8000)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Customer input validation (dynamic per-type fields)                 */
/* ------------------------------------------------------------------ */
describe("product-fields", () => {
  it("GAME_TOPUP requires a numeric player id", async () => {
    const { validateCustomerInputs } = await import("@/lib/product-fields");
    expect(validateCustomerInputs("GAME_TOPUP", { player_id: "5123456789" })).toEqual({
      player_id: "5123456789",
    });
    expect(validateCustomerInputs("GAME_TOPUP", { player_id: "abc" })).toBeNull();
    expect(validateCustomerInputs("GAME_TOPUP", {})).toBeNull();
    // Unknown keys are STRIPPED, never persisted (mass-assignment guard).
    expect(
      validateCustomerInputs("GAME_TOPUP", {
        player_id: "5123456789",
        role: "admin",
      }),
    ).toEqual({ player_id: "5123456789" });
  });

  it("MOBILE_RECHARGE requires an Egyptian mobile number", async () => {
    const { validateCustomerInputs } = await import("@/lib/product-fields");
    expect(
      validateCustomerInputs("MOBILE_RECHARGE", { phone: "01012345678" }),
    ).not.toBeNull();
    expect(validateCustomerInputs("MOBILE_RECHARGE", { phone: "0123" })).toBeNull();
    expect(validateCustomerInputs("MOBILE_RECHARGE", { phone: "09912345678" })).toBeNull();
    expect(
      validateCustomerInputs("MOBILE_RECHARGE", { phone: "1' OR '1'='1" }),
    ).toBeNull();
  });

  it("DIGITAL_CODE accepts empty inputs and strips unknown keys", async () => {
    const { validateCustomerInputs } = await import("@/lib/product-fields");
    expect(validateCustomerInputs("DIGITAL_CODE", {})).toEqual({});
    expect(validateCustomerInputs("DIGITAL_CODE", { anything: "x" })).toEqual({});
  });
});

/* ------------------------------------------------------------------ */
/* Zod schemas — hostile payloads                                       */
/* ------------------------------------------------------------------ */
describe("validation schemas", () => {
  it("rejects XSS/control chars in safe text fields", async () => {
    const { adminProductSchema } = await import("@/lib/validation");
    const base = {
      slug: "test-product",
      nameAr: "منتج تجريبي",
      description: "وصف تجريبي كافٍ",
      type: "DIGITAL_CODE",
      categoryId: 1,
      priceCents: 1000,
      stock: 0,
      icon: "🎁",
      featured: false,
      active: true,
    };
    expect(adminProductSchema.safeParse(base).success).toBe(true);
    expect(
      adminProductSchema.safeParse({ ...base, nameAr: "a\u0000b" }).success,
    ).toBe(false);
  });

  it("slug field enforces a strict allowlist", async () => {
    const { adminCategorySchema } = await import("@/lib/validation");
    const base = { slug: "ok-slug", nameAr: "تصنيف", icon: "🗂️" };
    expect(adminCategorySchema.safeParse(base).success).toBe(true);
    for (const bad of ["../etc", "UPPER", "a b", "x;drop table--", "ألف"]) {
      expect(
        adminCategorySchema.safeParse({ ...base, slug: bad }).success,
        `slug "${bad}" must be rejected`,
      ).toBe(false);
    }
  });

  it("pagination is bounded", async () => {
    const { adminListQuerySchema } = await import("@/lib/validation");
    expect(adminListQuerySchema.safeParse({ page: "3" }).success).toBe(true);
    expect(adminListQuerySchema.safeParse({ page: "0" }).success).toBe(false);
    expect(adminListQuerySchema.safeParse({ page: "999999999" }).success).toBe(false);
  });

  it("code upload bounds count and content", async () => {
    const { adminCodesUploadSchema } = await import("@/lib/validation");
    expect(adminCodesUploadSchema.safeParse({ codes: ["ABCD-EFGH"] }).success).toBe(true);
    expect(adminCodesUploadSchema.safeParse({ codes: [] }).success).toBe(false);
    expect(
      adminCodesUploadSchema.safeParse({ codes: ["ok-code", "bad\u0000code"] }).success,
    ).toBe(false);
    expect(
      adminCodesUploadSchema.safeParse({ codes: Array(501).fill("ABCD-EFGH") }).success,
    ).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Inventory code encryption                                            */
/* ------------------------------------------------------------------ */
describe("codes-crypto", () => {
  it("round-trips and produces non-deterministic ciphertext", async () => {
    const { encryptCode, decryptCode } = await import("@/lib/security/codes-crypto");
    const plain = "GPLAY-ABCD-1234-XYZ";
    const c1 = encryptCode(plain);
    const c2 = encryptCode(plain);
    expect(c1).not.toBe(c2); // random IV
    expect(c1).not.toContain(plain);
    expect(decryptCode(c1)).toBe(plain);
    expect(decryptCode(c2)).toBe(plain);
  });

  it("rejects tampered ciphertext (authenticated encryption)", async () => {
    const { encryptCode, decryptCode } = await import("@/lib/security/codes-crypto");
    const enc = encryptCode("SECRET-CODE-42");
    const tampered = enc.slice(0, -4) + (enc.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => decryptCode(tampered)).toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* Passwords                                                            */
/* ------------------------------------------------------------------ */
describe("password hashing", () => {
  it("hashes with scrypt and verifies correctly", async () => {
    const { hashPassword, verifyPassword } = await import("@/lib/security/password");
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});
