import { z } from "zod";

/**
 * Zod schemas — the single gate every piece of client input passes through
 * before it can touch the database. Everything is strictly bounded: lengths,
 * ranges, formats. Unknown keys are stripped.
 */

/* ----------------------------- Cart ------------------------------ */
export const addToCartSchema = z.object({
  productId: z.coerce.number().int().positive().max(2_147_483_647),
  quantity: z.coerce.number().int().min(1).max(99),
});

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
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    // Printable characters only — blocks control chars / header injection.
    .regex(/^[^\u0000-\u001f\u007f]*$/, "Invalid characters");

export const checkoutSchema = z.object({
  customerName: safeText(2, 128),
  email: z.string().trim().toLowerCase().email().max(254),
  addressLine1: safeText(4, 256),
  addressLine2: safeText(0, 256).optional().default(""),
  city: safeText(2, 128),
  postalCode: safeText(2, 32),
  country: safeText(2, 128),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

/* ------------------------ Account profile ------------------------- */
const profileText = (max: number) =>
  z.string().trim().max(max)
    .regex(/^[^\\u0000-\\u001f\\u007f]*$/, "Invalid characters");

export const accountProfileSchema = z.object({
  name: safeText(2, 128),
  phone: z.string().trim().max(32).regex(/^[+0-9().\\s-]*$/, "Enter a valid phone number"),
  addressLine1: profileText(256),
  addressLine2: profileText(256),
  city: profileText(128),
  postalCode: profileText(32),
  country: profileText(128),
});
export type AccountProfileInput = z.infer<typeof accountProfileSchema>;

/* ------------------------ Catalog queries ------------------------ */
export const productQuerySchema = z.object({
  q: z.string().trim().max(100).optional().default(""),
  category: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-z0-9-]*$/i)
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
  .regex(/^WS-[A-Z0-9-]+$/);
