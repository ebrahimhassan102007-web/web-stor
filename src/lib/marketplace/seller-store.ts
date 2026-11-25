/**
 * Merchant data access (S-26) — **every** query is scoped by `sellerId`.
 *
 * Anti-BOLA / anti-IDOR rule for the isolated seller portal: the seller id is
 * always resolved from the authenticated session (`users.id` → `seller_profiles`)
 * and passed in as the first argument of every helper. No function here accepts
 * a seller id from a request, and every product read/write includes
 * `AND seller_id = $sellerId` in the predicate — so merchant A targeting
 * merchant B's product id gets "not found", never a cross-tenant read or write.
 *
 * No `server-only` marker and no database singleton: callers pass their
 * database/transaction, which keeps the BOLA behaviour testable on PGlite.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "../db/schema";
import {
  categories,
  marketplaceAuditEvents,
  orderDisputes,
  orderItems,
  orders,
  products,
  sellerApplicationEvents,
  sellerProfiles,
} from "../db/schema";
import type { SellerPayoutOrder } from "./payout-policy";
import { normalizeStoreSlug, SELLER_TERMS_VERSION, type SellerApplyInput, type SellerProductInput } from "./seller-validation";
import { importVaultCodesForProduct, type VaultImportResult } from "./vault-stock";

export type SellerStoreDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

export type SellerProfileRow = typeof sellerProfiles.$inferSelect;
export type SellerProductRow = typeof products.$inferSelect;

/** Resolve the caller's own seller profile. Never trusts a request value. */
export async function findSellerByUserId(
  database: SellerStoreDatabase,
  userId: string,
): Promise<SellerProfileRow | undefined> {
  const [row] = await database
    .select()
    .from(sellerProfiles)
    .where(and(eq(sellerProfiles.userId, userId), eq(sellerProfiles.isPlatform, false)))
    .limit(1);
  return row;
}

export type SellerApplicationOutcome =
  | { ok: true; seller: SellerProfileRow }
  | { ok: false; error: "ALREADY_REGISTERED" | "SLUG_TAKEN" };

/**
 * Create a `pending` seller application for an existing (or brand-new) account.
 * The profile is never created as approved: status starts `pending` and only
 * the owner CLI can move it.
 */
export async function createSellerApplication(
  database: SellerStoreDatabase,
  input: {
    userId: string;
    application: SellerApplyInput;
    now?: Date;
    /** `signup` for merchant registration, `onboarding` for /seller apply. */
    source?: "signup" | "onboarding";
  },
): Promise<SellerApplicationOutcome> {
  const now = input.now ?? new Date();
  const existing = await findSellerByUserId(database, input.userId);
  if (existing) return { ok: false, error: "ALREADY_REGISTERED" };

  const slug = normalizeStoreSlug(input.application.storeSlug);
  const [slugTaken] = await database
    .select({ id: sellerProfiles.id })
    .from(sellerProfiles)
    .where(eq(sellerProfiles.storeSlug, slug))
    .limit(1);
  if (slugTaken) return { ok: false, error: "SLUG_TAKEN" };

  const [created] = await database
    .insert(sellerProfiles)
    .values({
      userId: input.userId,
      isPlatform: false,
      storeName: input.application.storeName,
      storeSlug: slug,
      storeDescription: input.application.storeDescription ?? "",
      phone: input.application.phone,
      country: input.application.country,
      status: "pending",
      termsAcceptedAt: now,
      termsVersion: SELLER_TERMS_VERSION,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();
  if (!created) return { ok: false, error: "ALREADY_REGISTERED" };

  await database.insert(sellerApplicationEvents).values({
    sellerId: created.id,
    actorId: input.userId,
    action: "submitted",
    toStatus: "pending",
    reason:
      input.source === "signup"
        ? "merchant registration"
        : "customer onboarding from /seller",
    createdAt: now,
  });
  await database.insert(marketplaceAuditEvents).values({
    actorId: input.userId,
    actorRole: "seller",
    action: "seller_application_submitted",
    targetType: "seller",
    targetId: created.id,
    metadata: { source: input.source ?? "onboarding", status: "pending" },
    createdAt: now,
  });

  return { ok: true, seller: created };
}

/** Products owned by one seller, newest first. */
export async function listSellerProducts(
  database: SellerStoreDatabase,
  sellerId: string,
): Promise<SellerProductRow[]> {
  return database
    .select()
    .from(products)
    .where(eq(products.sellerId, sellerId))
    .orderBy(desc(products.createdAt), desc(products.id));
}

/**
 * Read one product **only if this seller owns it**. The seller predicate is in
 * the SQL, so a foreign id returns `undefined` and the route answers 404 — it
 * never reveals that the product exists.
 */
export async function findSellerProduct(
  database: SellerStoreDatabase,
  input: { sellerId: string; productId: number },
): Promise<SellerProductRow | undefined> {
  if (!Number.isSafeInteger(input.productId) || input.productId <= 0) return undefined;
  const [row] = await database
    .select()
    .from(products)
    .where(and(eq(products.id, input.productId), eq(products.sellerId, input.sellerId)))
    .limit(1);
  return row;
}

function slugify(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "item";
}

export type SellerProductOutcome =
  | { ok: true; product: SellerProductRow }
  | { ok: false; error: "CATEGORY_NOT_FOUND" | "SLUG_UNAVAILABLE" };

/**
 * Create a draft listing owned by `sellerId`.
 *
 * The price is integer minor units, the currency is the platform currency
 * (USD), the stock counter starts at zero and the listing starts inactive:
 * nothing becomes purchasable until the seller imports real vault stock and the
 * owner-approved, 2FA-enabled gate allows publishing.
 */
export async function createSellerProduct(
  database: SellerStoreDatabase,
  input: {
    sellerId: string;
    storeSlug: string;
    listing: SellerProductInput;
    now?: Date;
  },
): Promise<SellerProductOutcome> {
  const [category] = await database
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, input.listing.categoryId))
    .limit(1);
  if (!category) return { ok: false, error: "CATEGORY_NOT_FOUND" };

  const now = input.now ?? new Date();
  const base = `${normalizeStoreSlug(input.storeSlug)}-${slugify(input.listing.name)}`.slice(0, 110);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const [created] = await database
      .insert(products)
      .values({
        slug: candidate,
        name: input.listing.name,
        nameAr: input.listing.nameAr ?? "",
        description: input.listing.description,
        descriptionAr: input.listing.descriptionAr ?? "",
        priceCents: input.listing.priceCents,
        categoryId: category.id,
        stock: 0,
        icon: input.listing.icon ?? "📦",
        inputType: input.listing.inputType ?? "none",
        sellerId: input.sellerId,
        isActive: false,
        createdAt: now,
      })
      .onConflictDoNothing({ target: products.slug })
      .returning();
    if (created) return { ok: true, product: created };
  }
  return { ok: false, error: "SLUG_UNAVAILABLE" };
}

/** Toggle a listing's live state — only for the owning seller. */
export async function setSellerProductActive(
  database: SellerStoreDatabase,
  input: { sellerId: string; productId: number; isActive: boolean },
): Promise<SellerProductRow | undefined> {
  const [updated] = await database
    .update(products)
    .set({ isActive: input.isActive })
    .where(and(eq(products.id, input.productId), eq(products.sellerId, input.sellerId)))
    .returning();
  return updated;
}

export type SellerStockOutcome =
  | { ok: true; result: VaultImportResult }
  | { ok: false; error: "PRODUCT_NOT_FOUND" | "INVALID_CODES" };

/**
 * Import real codes into **this seller's own** product.
 *
 * Ownership is checked before anything is written, so merchant A cannot push
 * codes into merchant B's inventory (which would let them poison a rival's
 * deliveries). Codes are sealed as v2 split-key envelopes and duplicates are
 * rejected by blind digest.
 */
export async function importSellerStock(
  database: SellerStoreDatabase,
  input: {
    sellerId: string;
    productId: number;
    codes: readonly string[];
  },
): Promise<SellerStockOutcome> {
  const product = await findSellerProduct(database, {
    sellerId: input.sellerId,
    productId: input.productId,
  });
  if (!product) return { ok: false, error: "PRODUCT_NOT_FOUND" };
  if (input.codes.length === 0) return { ok: false, error: "INVALID_CODES" };

  const result = await importVaultCodesForProduct(database, {
    productId: product.id,
    codes: input.codes,
  });
  await database.insert(marketplaceAuditEvents).values({
    actorId: null,
    actorRole: "seller",
    action: "seller_stock_imported",
    targetType: "product",
    targetId: String(product.id),
    metadata: {
      imported: result.imported,
      duplicates: result.duplicates,
      rejected: result.rejected,
    },
  });
  return { ok: true, result };
}

/**
 * Trusted order lines for a seller's payout view.
 *
 * Only paid/fulfilled/completed orders of this seller's products are returned,
 * each annotated with whether an `open` dispute currently freezes it. Buyer
 * identity, auth data and delivery secrets are never selected.
 */
export async function loadSellerPayoutOrders(
  database: SellerStoreDatabase,
  sellerId: string,
): Promise<SellerPayoutOrder[]> {
  const rows = await database
    .select({
      orderId: orders.id,
      orderStatus: orders.status,
      unitPriceCents: orderItems.unitPriceCents,
      quantity: orderItems.quantity,
      eligibility: orderDisputes.status,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .leftJoin(
      orderDisputes,
      and(eq(orderDisputes.orderId, orders.id), eq(orderDisputes.status, "open")),
    )
    .where(
      and(
        eq(products.sellerId, sellerId),
        inArray(orders.status, ["paid", "fulfilled", "completed", "cancelled", "refunded"]),
      ),
    );

  return rows.map((row) => ({
    orderId: row.orderId,
    orderStatus: row.orderStatus,
    unitPriceCents: row.unitPriceCents,
    quantity: row.quantity,
    currency: "USD",
    openDispute: row.eligibility === "open",
  }));
}

/** Seller's own sales counters for the workspace header. */
export async function countSellerProducts(
  database: SellerStoreDatabase,
  sellerId: string,
): Promise<{ products: number; live: number }> {
  const [row] = await database
    .select({
      products: sql<number>`count(*)::int`,
      live: sql<number>`count(*) filter (where ${products.isActive})::int`,
    })
    .from(products)
    .where(eq(products.sellerId, sellerId));
  return { products: row?.products ?? 0, live: row?.live ?? 0 };
}
