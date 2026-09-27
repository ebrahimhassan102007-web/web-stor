import { z } from "zod";

/**
 * Zod schemas — the single gate every piece of client input passes through
 * before it can touch the database. Strictly bounded lengths, ranges and
 * formats; unknown keys are stripped.
 */

/* ----------------------------- Shared ---------------------------- */
const safeText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, "قصير جداً")
    .max(max, "طويل جداً")
    // Printable characters only — blocks control chars / header injection.
    .regex(/^[^\u0000-\u001f\u007f]*$/, "يحتوي على رموز غير مسموح بها");

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("بريد إلكتروني غير صالح")
  .max(254);

const intId = z.coerce.number().int().positive().max(2_147_483_647);

export const uuidSchema = z.string().uuid();

export const MAX_LINE_QTY = 20;

/* ----------------------------- Cart ------------------------------ */
export const addToCartSchema = z.object({
  productId: intId,
  quantity: z.coerce.number().int().min(1).max(MAX_LINE_QTY),
  /** Raw customer inputs — re-validated against the product type server-side. */
  customerInputs: z.record(z.string(), z.string().max(256)).optional(),
});

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(0).max(MAX_LINE_QTY), // 0 removes
});

export const cartItemIdSchema = intId;

/* --------------------------- Checkout ---------------------------- */
export const checkoutSchema = z.object({
  /** Client-minted UUID enabling idempotent (replay-safe) checkout. */
  idempotencyKey: z.string().uuid(),
});

/* ------------------------------ Auth ------------------------------ */
export const registerSchema = z.object({
  name: safeText(2, 128),
  email: emailSchema,
  password: z
    .string()
    .min(10, "كلمة المرور يجب أن تكون 10 أحرف على الأقل")
    .max(128),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "رابط غير صالح"),
  password: z
    .string()
    .min(10, "كلمة المرور يجب أن تكون 10 أحرف على الأقل")
    .max(128),
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
    .enum(["newest", "price-asc", "price-desc", "featured"])
    .optional()
    .default("featured"),
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
  .regex(/^KS-[A-Z0-9-]+$/);

/* ------------------------------ Admin ----------------------------- */
const slugField = z
  .string()
  .trim()
  .min(2)
  .max(128)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "حروف لاتينية صغيرة وأرقام وشرطات فقط");

export const adminProductSchema = z.object({
  slug: slugField,
  nameAr: safeText(2, 256),
  nameEn: safeText(0, 256).optional().default(""),
  shortDescription: safeText(0, 512).optional().default(""),
  description: safeText(4, 4000),
  type: z.enum([
    "DIGITAL_CODE",
    "SUBSCRIPTION",
    "GAME_TOPUP",
    "MOBILE_RECHARGE",
    "DIGITAL_SERVICE",
  ]),
  categoryId: intId,
  priceCents: z.coerce.number().int().min(0).max(100_000_000),
  originalPriceCents: z.coerce
    .number()
    .int()
    .min(0)
    .max(100_000_000)
    .nullable()
    .optional()
    .default(null),
  stock: z.coerce.number().int().min(0).max(1_000_000),
  icon: safeText(1, 16),
  deliveryNote: safeText(0, 2000).optional().default(""),
  featured: z.boolean(),
  active: z.boolean(),
});

export const adminProductUpdateSchema = adminProductSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "لا توجد حقول للتحديث" });

export const adminCategorySchema = z.object({
  slug: slugField,
  nameAr: safeText(2, 128),
  nameEn: safeText(0, 128).optional().default(""),
  description: safeText(0, 512).optional().default(""),
  icon: safeText(1, 16),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional().default(0),
  visible: z.boolean().optional().default(true),
});

export const adminCategoryUpdateSchema = adminCategorySchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "لا توجد حقول للتحديث" });

/** Bulk code upload: one code per line, bounded count and length. */
export const adminCodesUploadSchema = z.object({
  codes: z
    .array(
      z
        .string()
        .trim()
        .min(4)
        .max(256)
        .regex(/^[^\u0000-\u001f\u007f]+$/, "رمز غير صالح"),
    )
    .min(1)
    .max(500),
});

export const adminOrderActionSchema = z.object({
  action: z.enum(["mark_processing", "mark_fulfilled", "cancel", "retry_fulfillment"]),
});

export const adminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
});
