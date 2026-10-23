import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

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
  ],
);

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: varchar("order_number", { length: 32 }).notNull(),
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
  (t) => [uniqueIndex("orders_number_idx").on(t.orderNumber)],
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
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
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
