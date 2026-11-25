CREATE TABLE "fulfillment_vault" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" integer NOT NULL,
	"order_item_id" integer,
	"code_index" integer DEFAULT 0 NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" varchar(32) NOT NULL,
	"auth_tag" varchar(32) NOT NULL,
	"key_id" varchar(64) NOT NULL,
	"revealed_at" timestamp with time zone,
	"reveal_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fulfillment_vault_code_index_nonnegative" CHECK ("fulfillment_vault"."code_index" >= 0),
	CONSTRAINT "fulfillment_vault_reveal_count_nonnegative" CHECK ("fulfillment_vault"."reveal_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "fulfillment_target" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "idempotency_key" varchar(64);--> statement-breakpoint
ALTER TABLE "fulfillment_vault" ADD CONSTRAINT "fulfillment_vault_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_vault" ADD CONSTRAINT "fulfillment_vault_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fulfillment_vault_product_available_idx" ON "fulfillment_vault" USING btree ("product_id","created_at") WHERE "fulfillment_vault"."order_item_id" IS NULL;--> statement-breakpoint
CREATE INDEX "fulfillment_vault_order_item_idx" ON "fulfillment_vault" USING btree ("order_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_vault_item_code_idx" ON "fulfillment_vault" USING btree ("order_item_id","code_index") WHERE "fulfillment_vault"."order_item_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_key_idx" ON "orders" USING btree ("idempotency_key");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_fulfillment_target_shape" CHECK ("order_items"."fulfillment_target" IS NULL OR (jsonb_typeof("order_items"."fulfillment_target") = 'object' AND "order_items"."fulfillment_target" ->> 'type' IN ('player-id','region','activation-email') AND jsonb_typeof("order_items"."fulfillment_target" -> 'value') = 'string' AND length(btrim("order_items"."fulfillment_target" ->> 'value')) > 0));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_input_type_known" CHECK ("products"."input_type" IN ('none','player-id','region','activation-email'));