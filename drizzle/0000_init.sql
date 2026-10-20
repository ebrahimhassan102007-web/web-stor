CREATE TABLE "cart_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"cart_id" uuid NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon" varchar(16) DEFAULT '📦' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" integer NOT NULL,
	"product_name" varchar(256) NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" varchar(32) NOT NULL,
	"status" varchar(24) DEFAULT 'confirmed' NOT NULL,
	"customer_name" varchar(128) NOT NULL,
	"email" varchar(254) NOT NULL,
	"address_line1" varchar(256) NOT NULL,
	"address_line2" varchar(256) DEFAULT '' NOT NULL,
	"city" varchar(128) NOT NULL,
	"postal_code" varchar(32) NOT NULL,
	"country" varchar(128) NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"shipping_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(128) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text NOT NULL,
	"price_cents" integer NOT NULL,
	"category_id" integer NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"rating" numeric(2, 1) DEFAULT '0.0' NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"icon" varchar(16) DEFAULT '📦' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_cart_product_idx" ON "cart_items" USING btree ("cart_id","product_id");--> statement-breakpoint
CREATE INDEX "cart_items_cart_idx" ON "cart_items" USING btree ("cart_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_number_idx" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_idx" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_featured_idx" ON "products" USING btree ("featured");