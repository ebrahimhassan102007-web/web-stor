ALTER TABLE "orders" ALTER COLUMN "address_line1" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "city" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "postal_code" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "country" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "cart_items" ADD COLUMN "input_value" varchar(128);--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "name_ar" varchar(128) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "description_ar" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "product_name_ar" varchar(256) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "delivery_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "delivery_info" varchar(256);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "name_ar" varchar(256) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "description_ar" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "input_type" varchar(16) DEFAULT 'none' NOT NULL;