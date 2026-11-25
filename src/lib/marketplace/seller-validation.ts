/**
 * Merchant input validation (S-26).
 *
 * Everything here is server-side and strictly bounded: a merchant can never
 * choose a seller id, a commission rate, a currency, a stock counter or a
 * "verified" flag — those are derived by the server. Slugs are normalized once,
 * in one place, so `/seller` and the registration form cannot disagree.
 */
import { z } from "zod";
import { normalizeSecurityInput } from "../security/digits";
import { MAX_PRODUCT_PRICE_CENTS } from "./commission";
import { MAX_VAULT_IMPORT_BATCH } from "./vault-stock";

/** Text field: security normalization (NFKC, bidi/invisible controls) + bounds. */
const cleanText = (min: number, max: number) =>
  z
    .string()
    .transform(normalizeSecurityInput)
    .pipe(
      z
        .string()
        .min(min)
        .max(max)
        .regex(/^[^\u0000-\u001f\u007f]*$/, "Invalid characters"),
    );

/** Terms version stamped on a new application; the owner CLI reads it back. */
export const SELLER_TERMS_VERSION = "seller-v1";

/**
 * Normalize a store slug: NFKC, lowercase, `&`/spaces → `-`, strip everything
 * that is not `[a-z0-9-]`, collapse dashes and trim them from both ends.
 * Idempotent, so re-submitting a normalized slug is a no-op.
 */
export function normalizeStoreSlug(raw: string): string {
  const base = typeof raw === "string" ? raw.normalize("NFKC") : "";
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const storeSlugSchema = z
  .string()
  .transform(normalizeStoreSlug)
  .pipe(
    z
      .string()
      .min(3, "Store slug is too short")
      .max(60, "Store slug is too long")
      .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/, "Store slug must be lowercase letters, numbers and dashes"),
  );

/** Reserved slugs that must never belong to a merchant storefront. */
export const RESERVED_STORE_SLUGS = new Set([
  "admin",
  "api",
  "account",
  "cart",
  "checkout",
  "login",
  "seller",
  "sellers",
  "support",
  "evora",
  "e-vora",
  "platform",
  "static",
]);

export const storePhoneSchema = cleanText(6, 32).pipe(z.string().regex(/^[+0-9][0-9 ()-]{5,31}$/, "Invalid phone number"));

export const countrySchema = z
  .string()
  .transform((value) => normalizeSecurityInput(value).toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{2}$/, "Use a two letter country code"));

/** Store application — used by merchant signup AND customer→merchant onboarding. */
export const sellerApplySchema = z.object({
  storeName: cleanText(2, 120),
  storeSlug: storeSlugSchema,
  storeDescription: cleanText(0, 600).optional().default(""),
  phone: storePhoneSchema,
  country: countrySchema,
  termsAccepted: z.literal(true),
});

export type SellerApplyInput = z.infer<typeof sellerApplySchema>;

export const SELLER_FULFILLMENT_TARGET_TYPES = ["none", "player-id", "region", "activation-email"] as const;

/** A merchant lists only digital goods with integer-cent pricing. */
export const sellerProductSchema = z.object({
  name: cleanText(2, 120),
  nameAr: cleanText(0, 120).optional().default(""),
  description: cleanText(10, 4000),
  descriptionAr: cleanText(0, 4000).optional().default(""),
  /** Integer minor units. Never a float, never a client total. */
  priceCents: z.number().int().min(1).max(MAX_PRODUCT_PRICE_CENTS),
  categoryId: z.number().int().positive(),
  inputType: z.enum(SELLER_FULFILLMENT_TARGET_TYPES).optional().default("none"),
  icon: z
    .string()
    .transform(normalizeSecurityInput)
    .pipe(z.string().max(16))
    .optional()
    .default("📦"),
});

export type SellerProductInput = z.infer<typeof sellerProductSchema>;

/** Live listing toggle. Only the owner of the product may flip it. */
export const sellerProductToggleSchema = z.object({
  isActive: z.boolean(),
});

/**
 * Batch stock import. The client may send either an explicit array or one
 * blob of newline/comma separated codes; both become a bounded array.
 */
export const sellerStockImportSchema = z.object({
  codes: z.array(z.string().min(1).max(4096)).max(MAX_VAULT_IMPORT_BATCH).optional(),
  raw: z.string().max(200_000).optional(),
}).refine((value) => Boolean(value.codes?.length || value.raw?.trim()), {
  message: "Provide at least one code",
});

/** Split a pasted blob into individual codes (deduplicated case-sensitively). */
export function splitStockInput(raw: string): string[] {
  return raw
    .split(/[\r\n,;]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_VAULT_IMPORT_BATCH);
}

/** Merchant signup payload: store fields are required only for merchants. */
export const merchantSignupFieldsSchema = z.object({
  storeName: cleanText(2, 120),
  storeSlug: storeSlugSchema,
  storeDescription: cleanText(0, 600).optional().default(""),
  phone: storePhoneSchema,
  country: countrySchema,
  termsAccepted: z.literal(true),
});
