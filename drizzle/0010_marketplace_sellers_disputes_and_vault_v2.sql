-- S-26: Wave 5B — dual-role sellers, isolated merchant portal, split-key
-- envelope vault v2 and buyer order disputes.
--
-- Every change below is additive or a deliberate relaxation of a NOT NULL:
--   1. `fulfillment_vault` gains the v2 split-key envelope columns, a blind
--      HMAC code digest (duplicate-code rejection without plaintext) and
--      burn-after-reveal columns. `ciphertext`/`iv`/`auth_tag` become nullable
--      so a shredded record can be truly erased while the row (and its
--      immutable delivery digest) survives as an audit fact.
--   2. `products` gains an owning seller (NULL = E-Vora platform) and an
--      `is_active` listing flag.
--   3. `seller_profiles` gains a permanent payout block stamped by dispute
--      refunds.
--   4. `order_disputes` records buyer disputes with at most one open dispute
--      per order.

ALTER TABLE "fulfillment_vault" ADD COLUMN "envelope_version" varchar(8) DEFAULT 'v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "fulfillment_vault" ADD COLUMN "wrapped_dek" text;--> statement-breakpoint
ALTER TABLE "fulfillment_vault" ADD COLUMN "dek_iv" varchar(32);--> statement-breakpoint
ALTER TABLE "fulfillment_vault" ADD COLUMN "dek_auth_tag" varchar(32);--> statement-breakpoint
ALTER TABLE "fulfillment_vault" ADD COLUMN "kek_id" varchar(64);--> statement-breakpoint
ALTER TABLE "fulfillment_vault" ADD COLUMN "code_digest" varchar(64);--> statement-breakpoint
ALTER TABLE "fulfillment_vault" ADD COLUMN "delivery_digest" varchar(64);--> statement-breakpoint
ALTER TABLE "fulfillment_vault" ADD COLUMN "shredded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fulfillment_vault" ALTER COLUMN "ciphertext" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "fulfillment_vault" ALTER COLUMN "iv" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "fulfillment_vault" ALTER COLUMN "auth_tag" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "fulfillment_vault" ADD CONSTRAINT "fulfillment_vault_envelope_version_known" CHECK ("fulfillment_vault"."envelope_version" IN ('v1','v2'));--> statement-breakpoint
ALTER TABLE "fulfillment_vault" ADD CONSTRAINT "fulfillment_vault_v2_envelope_complete" CHECK ("fulfillment_vault"."envelope_version" <> 'v2' OR "fulfillment_vault"."shredded_at" IS NOT NULL OR ("fulfillment_vault"."wrapped_dek" IS NOT NULL AND "fulfillment_vault"."dek_iv" IS NOT NULL AND "fulfillment_vault"."dek_auth_tag" IS NOT NULL AND "fulfillment_vault"."kek_id" IS NOT NULL AND "fulfillment_vault"."ciphertext" IS NOT NULL AND "fulfillment_vault"."iv" IS NOT NULL AND "fulfillment_vault"."auth_tag" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "fulfillment_vault" ADD CONSTRAINT "fulfillment_vault_shred_is_permanent" CHECK ("fulfillment_vault"."shredded_at" IS NULL OR ("fulfillment_vault"."revealed_at" IS NOT NULL AND "fulfillment_vault"."ciphertext" IS NULL AND "fulfillment_vault"."iv" IS NULL AND "fulfillment_vault"."auth_tag" IS NULL AND "fulfillment_vault"."wrapped_dek" IS NULL AND "fulfillment_vault"."dek_iv" IS NULL AND "fulfillment_vault"."dek_auth_tag" IS NULL));--> statement-breakpoint
ALTER TABLE "fulfillment_vault" ADD CONSTRAINT "fulfillment_vault_digest_shape" CHECK (("fulfillment_vault"."code_digest" IS NULL OR "fulfillment_vault"."code_digest" ~ '^[0-9a-f]{64}$') AND ("fulfillment_vault"."delivery_digest" IS NULL OR "fulfillment_vault"."delivery_digest" ~ '^[0-9a-f]{64}$'));--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_vault_code_digest_idx" ON "fulfillment_vault" USING btree ("product_id","code_digest") WHERE "fulfillment_vault"."code_digest" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN "payout_blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN "payout_blocked_reason" varchar(512) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "seller_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_seller_id_seller_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_seller_idx" ON "products" USING btree ("seller_id");--> statement-breakpoint
CREATE TABLE "order_disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" varchar(32) NOT NULL,
	"details" varchar(1000) DEFAULT '' NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"resolution_note" varchar(512) DEFAULT '' NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_disputes_status_known" CHECK ("order_disputes"."status" IN ('open','refunded','rejected')),
	CONSTRAINT "order_disputes_reason_known" CHECK ("order_disputes"."reason" IN ('not_received','invalid_code','already_used','wrong_item','other')),
	CONSTRAINT "order_disputes_closed_has_resolution" CHECK ("order_disputes"."status" = 'open' OR ("order_disputes"."resolved_at" IS NOT NULL AND length(btrim("order_disputes"."resolution_note")) > 0))
);--> statement-breakpoint
ALTER TABLE "order_disputes" ADD CONSTRAINT "order_disputes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_disputes" ADD CONSTRAINT "order_disputes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_disputes_open_order_idx" ON "order_disputes" USING btree ("order_id") WHERE "order_disputes"."status" = 'open';--> statement-breakpoint
CREATE INDEX "order_disputes_status_created_idx" ON "order_disputes" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "order_disputes_user_idx" ON "order_disputes" USING btree ("user_id","created_at");
