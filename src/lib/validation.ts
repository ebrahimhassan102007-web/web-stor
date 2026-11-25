import { z } from "zod";
import { normalizeSecurityInput, normalizeVerificationDigits } from "@/lib/security/digits";

const normalizedText = (schema: z.ZodString = z.string()) =>
  z.string().transform(normalizeSecurityInput).pipe(schema);

/**
 * Zod schemas — the single gate every piece of client input passes through
 * before it can touch the database. Everything is strictly bounded: lengths,
 * ranges, formats. Unknown keys are stripped.
 */

/* ----------------------------- Cart ------------------------------ */
export const addToCartSchema = z.object({
  productId: z.coerce.number().int().positive().max(2_147_483_647),
  quantity: z.coerce.number().int().min(1).max(99),
  /**
   * Optional delivery input for digital goods (Player ID for top-ups,
   * region code for gift cards). Bounded + control-char free; an empty
   * string is normalized to undefined.
   */
  inputValue: normalizedText(z.string().max(128).regex(/^[^\u0000-\u001f\u007f]*$/, "Invalid characters"))
    .optional()
    .transform((value) => value || undefined),
});

export type FulfillmentInputType = "none" | "player-id" | "region" | "activation-email";

export type FulfillmentTargetValidation =
  | { ok: true; value: string | null }
  | { ok: false };

/** Normalize and validate a target using the server-owned product input type. */
export function validateFulfillmentTarget(
  inputType: string,
  rawValue: string | null | undefined,
): FulfillmentTargetValidation {
  const value = rawValue === null || rawValue === undefined ? "" : normalizeSecurityInput(rawValue);
  if (inputType === "none") return value ? { ok: false } : { ok: true, value: null };
  if (inputType === "player-id") {
    const digits = normalizeVerificationDigits(value);
    return /^\d{5,32}$/.test(digits) ? { ok: true, value: digits } : { ok: false };
  }
  if (inputType === "region") {
    const region = value.toLowerCase();
    return ["global", "us", "sa", "ae", "eu"].includes(region)
      ? { ok: true, value: region }
      : { ok: false };
  }
  if (inputType === "activation-email") {
    const email = value.toLowerCase();
    return z.string().email().max(254).safeParse(email).success
      ? { ok: true, value: email }
      : { ok: false };
  }
  return { ok: false };
}

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(0).max(99), // 0 removes the line
});

export const cartItemIdSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(2_147_483_647);

/* --------------------------- Checkout ---------------------------- */
const safeText = (min: number, max: number) =>
  normalizedText(
    z.string()
      .min(min)
      .max(max)
      // Printable characters only — blocks control chars / header injection.
      .regex(/^[^\u0000-\u001f\u007f]*$/, "Invalid characters"),
  );

export const checkoutSchema = z.object({
  customerName: safeText(2, 128),
  email: normalizedText(z.string().toLowerCase().email().max(254)),
  // Digital delivery needs no postal address. The legacy address fields
  // are still accepted (optional) so older clients keep working.
  addressLine1: safeText(0, 256).optional().default(""),
  addressLine2: safeText(0, 256).optional().default(""),
  city: safeText(0, 128).optional().default(""),
  postalCode: safeText(0, 32).optional().default(""),
  country: safeText(0, 128).optional().default(""),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

/* ------------------------ Catalog queries ------------------------ */
export const productQuerySchema = z.object({
  q: normalizedText(z.string().max(100)).optional().default(""),
  category: normalizedText(z.string()
    .max(64)
    .regex(/^[a-z0-9-]*$/i))
    .optional()
    .default(""),
  sort: z
    .enum(["newest", "price-asc", "price-desc", "rating"])
    .optional()
    .default("newest"),
});

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9-]+$/i);

export const orderNumberSchema = z
  .string()
  .trim()
  .min(6)
  .max(32)
  // EV- is current (E-Vora); WS- kept for pre-rebrand orders.
  .regex(/^(EV|WS)-[A-Z0-9-]+$/);
