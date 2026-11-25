import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */
export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    /** Arabic display name (UI falls back to `name` when empty). */
    nameAr: varchar("name_ar", { length: 128 }).notNull().default(""),
    description: text("description").notNull().default(""),
    descriptionAr: text("description_ar").notNull().default(""),
    icon: varchar("icon", { length: 16 }).notNull().default("📦"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("categories_slug_idx").on(t.slug)],
);

/* ------------------------------------------------------------------ */
/* Products (digital goods)                                            */
/* ------------------------------------------------------------------ */
export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 128 }).notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    nameAr: varchar("name_ar", { length: 256 }).notNull().default(""),
    description: text("description").notNull(),
    descriptionAr: text("description_ar").notNull().default(""),
    /** Price stored in integer cents — never floats for money. */
    priceCents: integer("price_cents").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    /** Remaining digital codes / top-up credits available to deliver. */
    stock: integer("stock").notNull().default(0),
    rating: numeric("rating", { precision: 2, scale: 1 }).notNull().default("0.0"),
    reviewCount: integer("review_count").notNull().default(0),
    icon: varchar("icon", { length: 16 }).notNull().default("📦"),
    featured: boolean("featured").notNull().default(false),
    /**
     * What the customer must provide at purchase time:
     *  - "none"      → instant code delivered after checkout
     *  - "player-id" → game top-up credited to a player account id
     *  - "region"    → gift card locked to a store region
     */
    inputType: varchar("input_type", { length: 16 }).notNull().default("none"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("products_slug_idx").on(t.slug),
    index("products_category_idx").on(t.categoryId),
    index("products_featured_idx").on(t.featured),
    check("products_price_positive", sql`${t.priceCents} > 0`),
    check("products_stock_nonnegative", sql`${t.stock} >= 0`),
    check("products_input_type_known", sql`${t.inputType} IN ('none','player-id','region','activation-email')`),
  ],
);

/* ------------------------------------------------------------------ */
/* Carts (anonymous, session-cookie bound)                             */
/* ------------------------------------------------------------------ */
export const carts = pgTable("carts", {
  /** Random UUID; the cookie value is additionally HMAC-signed. */
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const cartItems = pgTable(
  "cart_items",
  {
    id: serial("id").primaryKey(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    /**
     * Customer-supplied delivery input for this line, when the product
     * requires one (player id for top-ups, region code for gift cards).
     */
    inputValue: varchar("input_value", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("cart_items_cart_product_idx").on(t.cartId, t.productId),
    index("cart_items_cart_idx").on(t.cartId),
    check("cart_items_quantity_range", sql`${t.quantity} BETWEEN 1 AND 99`),
  ],
);

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Owning account (S-08). Set from the signed-in session at checkout;
     * null for guest orders. Order history is keyed by this, never by the
     * typed email address.
     */
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    orderNumber: varchar("order_number", { length: 32 }).notNull(),
    /** HMAC-scoped checkout request key digest; raw client keys are never stored. */
    idempotencyKey: varchar("idempotency_key", { length: 64 }),
    promoCodeId: integer("promo_code_id").references(() => promoCodes.id, { onDelete: "set null" }),
    discountCents: integer("discount_cents").notNull().default(0),
    status: varchar("status", { length: 24 }).notNull().default("confirmed"),
    customerName: varchar("customer_name", { length: 128 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    // Legacy address columns — digital delivery doesn't need them, kept
    // (defaulted to "") for backwards compatibility with existing rows.
    addressLine1: varchar("address_line1", { length: 256 }).notNull().default(""),
    addressLine2: varchar("address_line2", { length: 256 }).notNull().default(""),
    city: varchar("city", { length: 128 }).notNull().default(""),
    postalCode: varchar("postal_code", { length: 32 }).notNull().default(""),
    country: varchar("country", { length: 128 }).notNull().default(""),
    /** Totals snapshotted at purchase time, in integer cents. */
    subtotalCents: integer("subtotal_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("orders_number_idx").on(t.orderNumber),
    index("orders_promo_code_idx").on(t.promoCodeId),
    uniqueIndex("orders_idempotency_key_idx").on(t.idempotencyKey),
    index("orders_email_idx").on(t.email),
    index("orders_user_idx").on(t.userId),
    check(
      "orders_status_known",
      sql`${t.status} IN ('confirmed','paid','completed','cancelled','fulfilled','pending','demo-unpaid')`,
    ),
    check("orders_totals_nonnegative", sql`${t.totalCents} >= 0 AND ${t.subtotalCents} >= 0 AND ${t.discountCents} >= 0`),
    check("orders_discount_within_subtotal", sql`${t.discountCents} <= ${t.subtotalCents}`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    /** Snapshots — order history must not change if the catalog does. */
    productName: varchar("product_name", { length: 256 }).notNull(),
    productNameAr: varchar("product_name_ar", { length: 256 }).notNull().default(""),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    /**
     * Digital code(s) delivered for this line — one per unit,
     * newline-separated when quantity > 1.
     */
    deliveryCode: text("delivery_code").notNull().default(""),
    /**
     * Delivery target echoed to the customer, stored as
     * "player-id:<value>" or "region:<code>" (null for plain codes).
     */
    deliveryInfo: varchar("delivery_info", { length: 256 }),
    fulfillmentTarget: jsonb("fulfillment_target").$type<{ type: string; value: string } | null>(),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    check("order_items_quantity_range", sql`${t.quantity} BETWEEN 1 AND 99`),
    check("order_items_price_positive", sql`${t.unitPriceCents} > 0`),
    check("order_items_fulfillment_target_shape", sql`${t.fulfillmentTarget} IS NULL OR (jsonb_typeof(${t.fulfillmentTarget}) = 'object' AND ${t.fulfillmentTarget} ->> 'type' IN ('player-id','region','activation-email') AND jsonb_typeof(${t.fulfillmentTarget} -> 'value') = 'string' AND length(btrim(${t.fulfillmentTarget} ->> 'value')) > 0)`),
  ],
);

/** Encrypted inventory and one-time-per-order-item fulfillment reveal state. */
export const fulfillmentVault = pgTable(
  "fulfillment_vault",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
    orderItemId: integer("order_item_id").references(() => orderItems.id, { onDelete: "cascade" }),
    codeIndex: integer("code_index").notNull().default(0),
    ciphertext: text("ciphertext").notNull(),
    iv: varchar("iv", { length: 32 }).notNull(),
    authTag: varchar("auth_tag", { length: 32 }).notNull(),
    keyId: varchar("key_id", { length: 64 }).notNull(),
    revealedAt: timestamp("revealed_at", { withTimezone: true }),
    revealCount: integer("reveal_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fulfillment_vault_product_available_idx").on(t.productId, t.createdAt).where(sql`${t.orderItemId} IS NULL`),
    index("fulfillment_vault_order_item_idx").on(t.orderItemId),
    uniqueIndex("fulfillment_vault_item_code_idx").on(t.orderItemId, t.codeIndex).where(sql`${t.orderItemId} IS NOT NULL`),
    check("fulfillment_vault_code_index_nonnegative", sql`${t.codeIndex} >= 0`),
    check("fulfillment_vault_reveal_count_nonnegative", sql`${t.revealCount} >= 0`),
  ],
);

/** One USD wallet per authenticated customer; all changes are ledger-backed. */
export const walletAccounts = pgTable(
  "wallet_accounts",
  {
    userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    balanceCents: integer("balance_cents").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("wallet_accounts_balance_nonnegative", sql`${t.balanceCents} >= 0`),
    check("wallet_accounts_currency_usd", sql`${t.currency} = 'USD'`),
  ],
);

/** Append-only wallet movements. The signed direction and amount are explicit. */
export const walletLedger = pgTable(
  "wallet_ledger",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    entryType: varchar("entry_type", { length: 16 }).notNull(),
    direction: varchar("direction", { length: 6 }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    description: varchar("description", { length: 160 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("wallet_ledger_idempotency_idx").on(t.idempotencyKey),
    index("wallet_ledger_user_created_idx").on(t.userId, t.createdAt),
    index("wallet_ledger_order_idx").on(t.orderId),
    check("wallet_ledger_amount_positive", sql`${t.amountCents} > 0`),
    check("wallet_ledger_entry_type_known", sql`${t.entryType} IN ('credit_topup','debit_order','credit_refund','adjustment')`),
    check("wallet_ledger_direction_known", sql`${t.direction} IN ('credit','debit')`),
    check("wallet_ledger_currency_usd", sql`${t.currency} = 'USD'`),
    check("wallet_ledger_type_direction", sql`(${t.entryType} = 'debit_order' AND ${t.direction} = 'debit') OR (${t.entryType} <> 'debit_order' AND ${t.direction} = 'credit')`),
  ],
);

/** Normalized promo/coupon configuration. Values are bps or integer cents. */
export const promoCodes = pgTable(
  "promo_codes",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 32 }).notNull(),
    description: varchar("description", { length: 160 }).notNull().default(""),
    descriptionAr: varchar("description_ar", { length: 160 }).notNull().default(""),
    discountType: varchar("discount_type", { length: 16 }).notNull(),
    discountValue: integer("discount_value").notNull(),
    minSubtotalCents: integer("min_subtotal_cents").notNull().default(0),
    maxDiscountCents: integer("max_discount_cents"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    maxRedemptions: integer("max_redemptions"),
    perUserLimit: integer("per_user_limit").notNull().default(1),
    isActive: boolean("is_active").notNull().default(false),
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("promo_codes_code_idx").on(t.code),
    index("promo_codes_public_active_idx").on(t.isPublic, t.isActive, t.startsAt),
    check("promo_codes_code_normalized", sql`${t.code} = upper(btrim(${t.code}))`),
    check("promo_codes_discount_type_known", sql`${t.discountType} IN ('percentage','fixed_cents')`),
    check("promo_codes_discount_value_positive", sql`${t.discountValue} > 0`),
    check("promo_codes_discount_bounds", sql`(${t.discountType} = 'percentage' AND ${t.discountValue} <= 10000) OR ${t.discountType} = 'fixed_cents'`),
    check("promo_codes_amounts_nonnegative", sql`${t.minSubtotalCents} >= 0 AND (${t.maxDiscountCents} IS NULL OR ${t.maxDiscountCents} > 0)`),
    check("promo_codes_limits_positive", sql`(${t.maxRedemptions} IS NULL OR ${t.maxRedemptions} > 0) AND ${t.perUserLimit} > 0`),
    check("promo_codes_expiry_after_start", sql`${t.expiresAt} IS NULL OR ${t.expiresAt} > ${t.startsAt}`),
  ],
);

export const promoRedemptions = pgTable(
  "promo_redemptions",
  {
    id: serial("id").primaryKey(),
    promoCodeId: integer("promo_code_id").notNull().references(() => promoCodes.id, { onDelete: "restrict" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    redeemerKey: varchar("redeemer_key", { length: 64 }).notNull(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    discountCents: integer("discount_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("promo_redemptions_order_idx").on(t.orderId),
    index("promo_redemptions_user_idx").on(t.promoCodeId, t.userId),
    index("promo_redemptions_key_idx").on(t.promoCodeId, t.redeemerKey),
    check("promo_redemptions_discount_positive", sql`${t.discountCents} > 0`),
  ],
);

/* ------------------------------------------------------------------ */
/* Customer authentication                                              */
/* ------------------------------------------------------------------ */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 254 }).notNull(),
    displayName: varchar("display_name", { length: 128 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }),
    googleSub: varchar("google_sub", { length: 255 }),
    /** Authorization role (S-13). ADMIN_EMAIL remains a bootstrap fallback. */
    role: varchar("role", { length: 16 }).notNull().default("customer"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    uniqueIndex("users_google_sub_idx").on(t.googleSub),
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
    // Superset of the previous rule: sellers are added, existing rows unchanged.
    check("users_role_known", sql`${t.role} IN ('customer','seller','admin')`),
  ],
);

export const emailVerificationCodes = pgTable(
  "email_verification_codes",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    /** HMAC-SHA256 digest only; the six-digit code is never stored. */
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("email_verification_codes_expiry_idx").on(t.expiresAt)],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("password_reset_tokens_hash_idx").on(t.tokenHash),
    uniqueIndex("password_reset_tokens_user_idx").on(t.userId),
    index("password_reset_tokens_expiry_idx").on(t.expiresAt),
  ],
);

export const userTotp = pgTable(
  "user_totp",
  {
    userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    /** AES-256-GCM authenticated envelope; plaintext TOTP secret is never persisted. */
    encryptedSecret: varchar("encrypted_secret", { length: 512 }).notNull(),
    enabledAt: timestamp("enabled_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastAcceptedCounter: integer("last_accepted_counter"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("user_totp_counter_nonnegative", sql`${t.lastAcceptedCounter} IS NULL OR ${t.lastAcceptedCounter} >= 0`)],
);

export const totpRecoveryCodes = pgTable(
  "totp_recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("totp_recovery_codes_hash_idx").on(t.codeHash), index("totp_recovery_codes_user_idx").on(t.userId)],
);

export const pendingTwoFactorChallenges = pgTable(
  "pending_two_factor_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    authMethod: varchar("auth_method", { length: 8 }).notNull(),
    returnTo: varchar("return_to", { length: 512 }).notNull().default("/account"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pending_two_factor_token_hash_idx").on(t.tokenHash),
    index("pending_two_factor_user_idx").on(t.userId),
    index("pending_two_factor_expiry_idx").on(t.expiresAt),
    check("pending_two_factor_auth_method_known", sql`${t.authMethod} IN ('email','google')`),
    check("pending_two_factor_attempts_nonnegative", sql`${t.attempts} >= 0`),
  ],
);

export const accountSessions = pgTable(
  "account_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 digest of a random 256-bit HttpOnly cookie token. */
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Last authenticated use; drives the idle timeout (S-09). */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Truncated user-agent for the session list UI (not an identifier). */
    userAgent: varchar("user_agent", { length: 256 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("account_sessions_token_hash_idx").on(t.tokenHash),
    index("account_sessions_user_idx").on(t.userId),
    index("account_sessions_expiry_idx").on(t.expiresAt),
  ],
);

export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    /** HMAC of a scoped IP/email bucket; raw identifiers are never persisted. */
    keyHash: varchar("key_hash", { length: 64 }).primaryKey(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true })
      .notNull(),
    count: integer("count").notNull().default(1),
  },
  (t) => [index("auth_rate_limits_window_idx").on(t.windowStartedAt)],
);

export const googleOAuthStates = pgTable(
  "google_oauth_states",
  {
    /** Hashed OAuth state; only a short-lived random state leaves the DB. */
    stateHash: varchar("state_hash", { length: 64 }).primaryKey(),
    nonce: varchar("nonce", { length: 64 }).notNull(),
    codeVerifier: varchar("code_verifier", { length: 128 }).notNull(),
    returnTo: varchar("return_to", { length: 512 }).notNull().default("/account"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("google_oauth_states_expiry_idx").on(t.expiresAt)],
);

export const securityAuditLog = pgTable(
  "security_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Machine event name, e.g. login_success / admin_denied. No secrets. */
    event: varchar("event", { length: 48 }).notNull(),
    /** Non-sensitive context (never emails, tokens, or passwords). */
    detail: varchar("detail", { length: 128 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("security_audit_log_user_idx").on(t.userId),
    index("security_audit_log_created_idx").on(t.createdAt),
  ],
);


/* ------------------------------------------------------------------ */
/* Marketplace: seller identity, approval history, audit trail         */
/* ------------------------------------------------------------------ */

/**
 * Seller storefront identity and approval state.
 *
 * Authorization NEVER reads this table from a cookie or request body: server
 * code resolves the signed-in `users.id` to a profile and re-reads `status`
 * on every protected operation. `status` is the authoritative seller gate.
 *
 * Exactly one platform-owned profile exists (`is_platform = true`,
 * `user_id = NULL`) so E-Vora's own catalogue and third-party sellers share
 * one reporting shape (see docs/DECISIONS.md D-11).
 */
export const sellerProfiles = pgTable(
  "seller_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Owning account. NULL only for the single platform-owned profile. */
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    isPlatform: boolean("is_platform").notNull().default(false),
    storeName: varchar("store_name", { length: 120 }).notNull(),
    storeSlug: varchar("store_slug", { length: 140 }).notNull(),
    storeDescription: text("store_description").notNull().default(""),
    phone: varchar("phone", { length: 32 }).notNull(),
    /** ISO-3166 alpha-2, uppercase. */
    country: varchar("country", { length: 2 }).notNull(),
    businessType: varchar("business_type", { length: 32 }).notNull().default(""),
    businessRegistration: varchar("business_registration", { length: 64 })
      .notNull()
      .default(""),
    /** pending | approved | rejected | suspended — new sellers default to pending. */
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    termsVersion: varchar("terms_version", { length: 16 }).notNull().default(""),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    rejectionReason: varchar("rejection_reason", { length: 512 })
      .notNull()
      .default(""),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendedReason: varchar("suspended_reason", { length: 512 })
      .notNull()
      .default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("seller_profiles_user_idx").on(t.userId),
    uniqueIndex("seller_profiles_slug_idx").on(t.storeSlug),
    uniqueIndex("seller_profiles_single_platform_idx")
      .on(t.isPlatform)
      .where(sql`${t.isPlatform}`),
    index("seller_profiles_status_idx").on(t.status),
    check(
      "seller_profiles_status_known",
      sql`${t.status} IN ('pending','approved','rejected','suspended')`,
    ),
    // A rejected application must record why (server writes the reason).
    check(
      "seller_profiles_rejection_reason_required",
      sql`${t.status} <> 'rejected' OR length(btrim(${t.rejectionReason})) > 0`,
    ),
    // Exactly one kind of row: platform-owned (no user) or a real applicant.
    check(
      "seller_profiles_identity_shape",
      sql`(${t.isPlatform} AND ${t.userId} IS NULL) OR (NOT ${t.isPlatform} AND ${t.userId} IS NOT NULL)`,
    ),
    check(
      "seller_profiles_country_uppercase",
      sql`${t.country} ~ '^[A-Z]{2}$'`,
    ),
    check(
      "seller_profiles_terms_for_real_sellers",
      sql`${t.isPlatform} OR ${t.termsAcceptedAt} IS NOT NULL`,
    ),
  ],
);

/** Append-only approval history (submitted / approved / rejected / suspended …). */
export const sellerApplicationEvents = pgTable(
  "seller_application_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellerProfiles.id, { onDelete: "cascade" }),
    /** Admin or applicant who caused the event; NULL for system events. */
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 24 }).notNull(),
    fromStatus: varchar("from_status", { length: 16 }),
    toStatus: varchar("to_status", { length: 16 }),
    reason: varchar("reason", { length: 512 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("seller_application_events_seller_idx").on(t.sellerId, t.createdAt),
    check(
      "seller_application_events_action_known",
      sql`${t.action} IN ('submitted','resubmitted','approved','rejected','suspended','reactivated','terms_accepted','info_updated')`,
    ),
  ],
);

/**
 * Marketplace audit trail for sensitive approvals, moderation and money moves.
 *
 * `metadata` is allow-listed, non-sensitive context (ids, amounts, statuses,
 * reasons) — never emails, tokens, passwords or full payment references.
 * Written in the same transaction as the action it describes where practical.
 */
export const marketplaceAuditEvents = pgTable(
  "marketplace_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorRole: varchar("actor_role", { length: 16 }).notNull().default(""),
    action: varchar("action", { length: 48 }).notNull(),
    targetType: varchar("target_type", { length: 24 }).notNull(),
    targetId: varchar("target_id", { length: 64 }).notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Request correlation id from the proxy, when available. */
    requestId: varchar("request_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("marketplace_audit_events_created_idx").on(t.createdAt),
    index("marketplace_audit_events_actor_idx").on(t.actorId),
    index("marketplace_audit_events_target_idx").on(t.targetType, t.targetId),
    index("marketplace_audit_events_action_idx").on(t.action),
  ],
);

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */
export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
}));

export const cartsRelations = relations(carts, ({ many }) => ({
  items: many(cartItems),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
  product: one(products, {
    fields: [cartItems.productId],
    references: [products.id],
  }),
}));

export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));


export const sellerProfilesRelations = relations(
  sellerProfiles,
  ({ one, many }) => ({
    user: one(users, {
      fields: [sellerProfiles.userId],
      references: [users.id],
    }),
    events: many(sellerApplicationEvents),
  }),
);

export const sellerApplicationEventsRelations = relations(
  sellerApplicationEvents,
  ({ one }) => ({
    seller: one(sellerProfiles, {
      fields: [sellerApplicationEvents.sellerId],
      references: [sellerProfiles.id],
    }),
  }),
);

/* ------------------------------------------------------------------ */
/* Inferred types                                                      */
/* ------------------------------------------------------------------ */
export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Cart = typeof carts.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type User = typeof users.$inferSelect;
export type AccountSession = typeof accountSessions.$inferSelect;
export type SellerProfile = typeof sellerProfiles.$inferSelect;
export type SellerApplicationEvent = typeof sellerApplicationEvents.$inferSelect;
export type MarketplaceAuditEvent = typeof marketplaceAuditEvents.$inferSelect;
