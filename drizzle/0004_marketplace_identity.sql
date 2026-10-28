CREATE TABLE "marketplace_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_role" varchar(16) DEFAULT '' NOT NULL,
	"action" varchar(48) NOT NULL,
	"target_type" varchar(24) NOT NULL,
	"target_id" varchar(64) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" varchar(24) NOT NULL,
	"from_status" varchar(16),
	"to_status" varchar(16),
	"reason" varchar(512) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_application_events_action_known" CHECK ("seller_application_events"."action" IN ('submitted','resubmitted','approved','rejected','suspended','reactivated','terms_accepted','info_updated'))
);
--> statement-breakpoint
CREATE TABLE "seller_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"is_platform" boolean DEFAULT false NOT NULL,
	"store_name" varchar(120) NOT NULL,
	"store_slug" varchar(140) NOT NULL,
	"store_description" text DEFAULT '' NOT NULL,
	"phone" varchar(32) NOT NULL,
	"country" varchar(2) NOT NULL,
	"business_type" varchar(32) DEFAULT '' NOT NULL,
	"business_registration" varchar(64) DEFAULT '' NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"terms_accepted_at" timestamp with time zone,
	"terms_version" varchar(16) DEFAULT '' NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"rejection_reason" varchar(512) DEFAULT '' NOT NULL,
	"suspended_at" timestamp with time zone,
	"suspended_reason" varchar(512) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_profiles_status_known" CHECK ("seller_profiles"."status" IN ('pending','approved','rejected','suspended')),
	CONSTRAINT "seller_profiles_rejection_reason_required" CHECK ("seller_profiles"."status" <> 'rejected' OR length(btrim("seller_profiles"."rejection_reason")) > 0),
	CONSTRAINT "seller_profiles_identity_shape" CHECK (("seller_profiles"."is_platform" AND "seller_profiles"."user_id" IS NULL) OR (NOT "seller_profiles"."is_platform" AND "seller_profiles"."user_id" IS NOT NULL)),
	CONSTRAINT "seller_profiles_country_uppercase" CHECK ("seller_profiles"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "seller_profiles_terms_for_real_sellers" CHECK ("seller_profiles"."is_platform" OR "seller_profiles"."terms_accepted_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role_known";--> statement-breakpoint
ALTER TABLE "marketplace_audit_events" ADD CONSTRAINT "marketplace_audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_application_events" ADD CONSTRAINT "seller_application_events_seller_id_seller_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_application_events" ADD CONSTRAINT "seller_application_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketplace_audit_events_created_idx" ON "marketplace_audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "marketplace_audit_events_actor_idx" ON "marketplace_audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "marketplace_audit_events_target_idx" ON "marketplace_audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "marketplace_audit_events_action_idx" ON "marketplace_audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "seller_application_events_seller_idx" ON "seller_application_events" USING btree ("seller_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_profiles_user_idx" ON "seller_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_profiles_slug_idx" ON "seller_profiles" USING btree ("store_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_profiles_single_platform_idx" ON "seller_profiles" USING btree ("is_platform") WHERE "seller_profiles"."is_platform";--> statement-breakpoint
CREATE INDEX "seller_profiles_status_idx" ON "seller_profiles" USING btree ("status");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_known" CHECK ("users"."role" IN ('customer','seller','admin'));--> statement-breakpoint
-- Data (not DDL): E-Vora's own platform-owned seller profile (DECISIONS D-11).
-- It is a system row, not a login: `user_id` stays NULL, enforced by the
-- seller_profiles_identity_shape CHECK. Third-party sellers and platform sales
-- therefore share one reporting shape while no platform commission is booked
-- against E-Vora itself. Deterministic id + ON CONFLICT make the insert safe to
-- replay and safe on databases that already contain the row.
INSERT INTO "seller_profiles" (
	"id",
	"user_id",
	"is_platform",
	"store_name",
	"store_slug",
	"store_description",
	"phone",
	"country",
	"status",
	"terms_version",
	"approved_at"
) VALUES (
	'e0e0e0e0-0000-4000-8000-000000000001',
	NULL,
	true,
	'E-Vora',
	'e-vora-platform',
	'E-Vora-owned catalogue items.',
	'',
	'EG',
	'approved',
	'platform-v1',
	now()
) ON CONFLICT DO NOTHING;
