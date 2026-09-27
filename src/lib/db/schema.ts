import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* ================================================================== */
/* Khodmtak Store — خدمتك ستور                                        */
/* Digital services marketplace domain model.                          */
/* All money is integer piasters/cents (EGP). No floats, ever.         */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/* Users & sessions                                                    */
/* ------------------------------------------------------------------ */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 254 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    /** scrypt hash, PHC-style string. Never returned by any API. */
    passwordHash: text("password_hash").notNull(),
    role: varchar("role", { length: 16 }).notNull().default("customer"),
    disabled: boolean("disabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    check("users_role_check", sql`${t.role} in ('customer', 'admin')`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** SHA-256 of the opaque session token; raw token lives only in the cookie. */
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_idx").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
    index("sessions_expires_idx").on(t.expiresAt),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("password_reset_tokens_hash_idx").on(t.tokenHash)],
);

/* ------------------------------------------------------------------ */
/* Categories (database-driven, admin-managed, orderable)              */
/* ------------------------------------------------------------------ */
export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull(),
    /** Arabic name — the primary display name. */
    nameAr: varchar("name_ar", { length: 128 }).notNull(),
    nameEn: varchar("name_en", { length: 128 }).notNull().default(""),
    description: text("description").notNull().default(""),
    icon: varchar("icon", { length: 16 }).notNull().default("🛒"),
    sortOrder: integer("sort_order").notNull().default(0),
    visible: boolean("visible").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("categories_slug_idx").on(t.slug),
    index("categories_sort_idx").on(t.sortOrder),
  ],
);

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */
export const PRODUCT_TYPES = [
  "DIGITAL_CODE",
  "SUBSCRIPTION",
  "GAME_TOPUP",
  "MOBILE_RECHARGE",
  "DIGITAL_SERVICE",
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 128 }).notNull(),
    nameAr: varchar("name_ar", { length: 256 }).notNull(),
    nameEn: varchar("name_en", { length: 256 }).notNull().default(""),
    shortDescription: varchar("short_description", { length: 512 })
      .notNull()
      .default(""),
    description: text("description").notNull(),
    type: varchar("type", { length: 24 }).notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    /** Selling price in integer piasters (EGP cents). */
    priceCents: integer("price_cents").notNull(),
    /** Optional pre-discount price for strike-through display. */
    originalPriceCents: integer("original_price_cents"),
    currency: varchar("currency", { length: 3 }).notNull().default("EGP"),
    stock: integer("stock").notNull().default(0),
    icon: varchar("icon", { length: 16 }).notNull().default("🛒"),
    /** Post-purchase delivery/activation instructions shown to the buyer. */
    deliveryNote: text("delivery_note").notNull().default(""),
    /** Extra provider metadata (e.g. game/provider identifiers). */
    providerMeta: jsonb("provider_meta"),
    rating: varchar("rating", { length: 4 }).notNull().default("4.8"),
    reviewCount: integer("review_count").notNull().default(0),
    featured: boolean("featured").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("products_slug_idx").on(t.slug),
    index("products_category_idx").on(t.categoryId),
    index("products_featured_idx").on(t.featured),
    index("products_active_idx").on(t.active),
    check(
      "products_type_check",
      sql`${t.type} in ('DIGITAL_CODE', 'SUBSCRIPTION', 'GAME_TOPUP', 'MOBILE_RECHARGE', 'DIGITAL_SERVICE')`,
    ),
    check("products_stock_nonnegative", sql`${t.stock} >= 0`),
    check("products_price_nonnegative", sql`${t.priceCents} >= 0`),
    check(
      "products_original_price_check",
      sql`${t.originalPriceCents} is null or ${t.originalPriceCents} >= ${t.priceCents}`,
    ),
  ],
);

/* ------------------------------------------------------------------ */
/* Digital code inventory (encrypted at rest, single-sale guaranteed)  */
/* ------------------------------------------------------------------ */
export const CODE_STATUSES = ["AVAILABLE", "RESERVED", "SOLD", "VOID"] as const;
export type CodeStatus = (typeof CODE_STATUSES)[number];

export const digitalCodes = pgTable(
  "digital_codes",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** AES-256-GCM encrypted code value. Plaintext never touches the DB or logs. */
    codeEncrypted: text("code_encrypted").notNull(),
    status: varchar("status", { length: 12 }).notNull().default("AVAILABLE"),
    /** Set when RESERVED/SOLD — binds the code to exactly one order item. */
    orderItemId: integer("order_item_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    soldAt: timestamp("sold_at", { withTimezone: true }),
  },
  (t) => [
    index("digital_codes_product_status_idx").on(t.productId, t.status),
    index("digital_codes_order_item_idx").on(t.orderItemId),
    check(
      "digital_codes_status_check",
      sql`${t.status} in ('AVAILABLE', 'RESERVED', 'SOLD', 'VOID')`,
    ),
    check(
      "digital_codes_binding_check",
      sql`(${t.status} in ('AVAILABLE', 'VOID') and ${t.orderItemId} is null) or (${t.status} in ('RESERVED', 'SOLD') and ${t.orderItemId} is not null)`,
    ),
  ],
);

/* ------------------------------------------------------------------ */
/* Carts (anonymous, signed-cookie bound)                              */
/* ------------------------------------------------------------------ */
export const carts = pgTable("carts", {
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
    /** Validated per-product customer inputs (e.g. player id, phone). */
    customerInputs: jsonb("customer_inputs"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("cart_items_cart_product_idx").on(t.cartId, t.productId),
    index("cart_items_cart_idx").on(t.cartId),
    check(
      "cart_items_quantity_range",
      sql`${t.quantity} >= 1 and ${t.quantity} <= 20`,
    ),
  ],
);

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */
export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "FULFILLED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["UNPAID", "PAID", "REFUNDED"] as const;
export const FULFILLMENT_STATUSES = [
  "PENDING",
  "PROCESSING",
  "FULFILLED",
  "FAILED",
] as const;

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Public, unguessable reference (KS-XXXXXXXXXX). */
    orderNumber: varchar("order_number", { length: 32 }).notNull(),
    /** Digital delivery requires an account — always owned. */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Client-minted UUID making duplicate checkout submissions idempotent. */
    idempotencyKey: uuid("idempotency_key").notNull(),
    status: varchar("status", { length: 24 })
      .notNull()
      .default("PENDING_PAYMENT"),
    paymentStatus: varchar("payment_status", { length: 12 })
      .notNull()
      .default("UNPAID"),
    fulfillmentStatus: varchar("fulfillment_status", { length: 12 })
      .notNull()
      .default("PENDING"),
    paymentProvider: varchar("payment_provider", { length: 24 })
      .notNull()
      .default("mock"),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("EGP"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("orders_number_idx").on(t.orderNumber),
    uniqueIndex("orders_idempotency_idx").on(t.idempotencyKey),
    index("orders_user_idx").on(t.userId),
    index("orders_status_idx").on(t.status),
    check(
      "orders_status_check",
      sql`${t.status} in ('PENDING_PAYMENT', 'PAID', 'PROCESSING', 'FULFILLED', 'FAILED', 'CANCELLED', 'REFUNDED')`,
    ),
    check(
      "orders_payment_status_check",
      sql`${t.paymentStatus} in ('UNPAID', 'PAID', 'REFUNDED')`,
    ),
    check(
      "orders_fulfillment_status_check",
      sql`${t.fulfillmentStatus} in ('PENDING', 'PROCESSING', 'FULFILLED', 'FAILED')`,
    ),
    check(
      "orders_totals_nonnegative",
      sql`${t.subtotalCents} >= 0 and ${t.discountCents} >= 0 and ${t.totalCents} >= 0`,
    ),
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
    /** Snapshots — order history is immutable if the catalog changes. */
    productNameAr: varchar("product_name_ar", { length: 256 }).notNull(),
    productType: varchar("product_type", { length: 24 }).notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    /** Validated customer inputs snapshot (player id / phone / ...). */
    customerInputs: jsonb("customer_inputs"),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    check("order_items_quantity_positive", sql`${t.quantity} >= 1`),
    check("order_items_price_nonnegative", sql`${t.unitPriceCents} >= 0`),
  ],
);

/* ------------------------------------------------------------------ */
/* Deliveries — what the customer actually received                    */
/* ------------------------------------------------------------------ */
export const deliveries = pgTable(
  "deliveries",
  {
    id: serial("id").primaryKey(),
    orderItemId: integer("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 16 }).notNull(), // code | topup | recharge | manual
    /** AES-256-GCM encrypted payload (the code). Null for reference-only kinds. */
    payloadEncrypted: text("payload_encrypted"),
    /** Safe, non-secret note (provider reference, instructions). */
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("deliveries_order_item_idx").on(t.orderItemId),
    check(
      "deliveries_kind_check",
      sql`${t.kind} in ('code', 'topup', 'recharge', 'manual')`,
    ),
  ],
);

/* ------------------------------------------------------------------ */
/* Payment events — webhook idempotency ledger                         */
/* ------------------------------------------------------------------ */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: serial("id").primaryKey(),
    provider: varchar("provider", { length: 24 }).notNull(),
    /** Provider event id — unique index makes webhook replay a no-op. */
    eventId: varchar("event_id", { length: 128 }).notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("payment_events_event_idx").on(t.provider, t.eventId)],
);

/* ------------------------------------------------------------------ */
/* Admin audit log                                                     */
/* ------------------------------------------------------------------ */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    adminId: uuid("admin_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 64 }).notNull(),
    targetType: varchar("target_type", { length: 32 }).notNull(),
    targetId: varchar("target_id", { length: 64 }).notNull(),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  orders: many(orders),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  codes: many(digitalCodes),
}));

export const digitalCodesRelations = relations(digitalCodes, ({ one }) => ({
  product: one(products, {
    fields: [digitalCodes.productId],
    references: [products.id],
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

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  deliveries: many(deliveries),
}));

export const deliveriesRelations = relations(deliveries, ({ one }) => ({
  orderItem: one(orderItems, {
    fields: [deliveries.orderItemId],
    references: [orderItems.id],
  }),
}));

/* ------------------------------------------------------------------ */
/* Inferred types                                                      */
/* ------------------------------------------------------------------ */
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type DigitalCode = typeof digitalCodes.$inferSelect;
export type Cart = typeof carts.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Delivery = typeof deliveries.$inferSelect;
