import { z } from "zod";

/**
 * Zod schemas — the single gate every piece of client input passes through
 * before it can touch the database. Everything is strictly bounded: lengths,
 * ranges, formats. Unknown keys are stripped.
 */

/* ----------------------------- Shared ---------------------------- */
const safeText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    // Printable characters only — blocks control chars / header injection.
    .regex(/^[^\u0000-\u001f\u007f]*$/, "Invalid characters");

const emailSchema = z.string().trim().toLowerCase().email().max(254);

const intId = z.coerce.number().int().positive().max(2_147_483_647);

export const uuidSchema = z.string().uuid();

/* ----------------------------- Cart ------------------------------ */
export const addToCartSchema = z.object({
  productId: intId,
  quantity: z.coerce.number().int().min(1).max(99),
});

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(0).max(99), // 0 removes the line
});

export const cartItemIdSchema = intId;

/* --------------------------- Checkout ---------------------------- */
export const checkoutSchema = z.object({
  customerName: safeText(2, 128),
  email: emailSchema,
  addressLine1: safeText(4, 256),
  addressLine2: safeText(0, 256).optional().default(""),
  city: safeText(2, 128),
  postalCode: safeText(2, 32),
  country: safeText(2, 128),
  /** Client-minted UUID enabling idempotent (replay-safe) checkout. */
  idempotencyKey: z.string().uuid(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

/* ------------------------------ Auth ------------------------------ */
export const registerSchema = z.object({
  name: safeText(2, 128),
  email: emailSchema,
  password: z.string().min(10, "Use at least 10 characters").max(128),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "Invalid token"),
  password: z.string().min(10, "Use at least 10 characters").max(128),
});

/* ------------------------ Catalog queries ------------------------ */
export const PRODUCTS_PAGE_SIZE = 24;

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
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
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

/* ------------------------------ Admin ----------------------------- */
export const adminProductSchema = z.object({
  name: safeText(2, 256),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(128)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, digits and hyphens"),
  description: safeText(4, 4000),
  priceCents: z.coerce.number().int().min(0).max(100_000_000),
  categoryId: intId,
  stock: z.coerce.number().int().min(0).max(1_000_000),
  icon: safeText(1, 16),
  featured: z.boolean(),
  active: z.boolean(),
});

export const adminProductUpdateSchema = adminProductSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: "No fields to update" },
);

export const adminCategorySchema = z.object({
  name: safeText(2, 128),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, digits and hyphens"),
  description: safeText(0, 512).optional().default(""),
  icon: safeText(1, 16),
});

export const adminOrderStatusSchema = z.object({
  status: z.enum([
    "pending_payment",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ]),
});

export const adminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
});
