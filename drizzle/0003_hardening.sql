-- Data-safety pre-step for users_email_lowercase: normalize stored emails
-- first. If two historic rows differ only by case this fails loudly inside
-- the migration transaction (unique index) instead of corrupting data;
-- resolve duplicates manually from a backup, then re-run.
UPDATE "users" SET "email" = lower("email") WHERE "email" <> lower("email");--> statement-breakpoint
CREATE TABLE "security_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"event" varchar(48) NOT NULL,
	"detail" varchar(128) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_sessions" ADD COLUMN "last_used_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "account_sessions" ADD COLUMN "user_agent" varchar(256) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "user_id" uuid;--> statement-breakpoint
-- S-08 backfill: attribute a historic order to an account ONLY when that
-- account's email was verified (proof of mailbox ownership). Orders typed
-- with someone else's email at guest checkout stay unattributed (NULL).
UPDATE "orders" SET "user_id" = "users"."id" FROM "users" WHERE lower("orders"."email") = "users"."email" AND "users"."email_verified_at" IS NOT NULL AND "orders"."user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" varchar(16) DEFAULT 'customer' NOT NULL;--> statement-breakpoint
ALTER TABLE "security_audit_log" ADD CONSTRAINT "security_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "security_audit_log_user_idx" ON "security_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "security_audit_log_created_idx" ON "security_audit_log" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_email_idx" ON "orders" USING btree ("email");--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_quantity_range" CHECK ("cart_items"."quantity" BETWEEN 1 AND 99);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_range" CHECK ("order_items"."quantity" BETWEEN 1 AND 99);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_price_positive" CHECK ("order_items"."unit_price_cents" > 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_known" CHECK ("orders"."status" IN ('confirmed','paid','completed','cancelled','fulfilled','pending','demo-unpaid'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_totals_nonnegative" CHECK ("orders"."total_cents" >= 0 AND "orders"."subtotal_cents" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_price_positive" CHECK ("products"."price_cents" > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_stock_nonnegative" CHECK ("products"."stock" >= 0);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_known" CHECK ("users"."role" IN ('customer','admin'));