-- S-25: two-tier threat shield.
--
-- `security_threat_events` is an append-only adversary log keyed by a derived
-- actor identifier (trusted IP or a salted header fingerprint) -- never a raw
-- address, cookie, or email.
--
-- `security_bans` holds at most one row per actor. `actor_key` is NOT NULL by
-- design: a ban can only exist for an actor the proxy could actually identify,
-- so an unidentified request can never create a global ban.

CREATE TABLE "security_threat_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_kind" varchar(16) NOT NULL,
	"actor_key" varchar(80),
	"user_id" uuid,
	"signal" varchar(40) NOT NULL,
	"tier" integer NOT NULL,
	"path" varchar(256) DEFAULT '' NOT NULL,
	"method" varchar(8) DEFAULT '' NOT NULL,
	"detail" varchar(160) DEFAULT '' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "security_threat_events_kind_known" CHECK ("security_threat_events"."actor_kind" IN ('ip','fingerprint','unknown')),
	CONSTRAINT "security_threat_events_tier_known" CHECK ("security_threat_events"."tier" IN (1, 2))
);
--> statement-breakpoint
CREATE TABLE "security_bans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_key" varchar(80) NOT NULL,
	"actor_kind" varchar(16) NOT NULL,
	"tier" integer NOT NULL,
	"signal" varchar(40) NOT NULL,
	"strikes" integer DEFAULT 1 NOT NULL,
	"permanent" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_strike_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"lifted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "security_bans_kind_known" CHECK ("security_bans"."actor_kind" IN ('ip','fingerprint')),
	CONSTRAINT "security_bans_tier_known" CHECK ("security_bans"."tier" IN (1, 2)),
	CONSTRAINT "security_bans_strikes_positive" CHECK ("security_bans"."strikes" >= 1),
	CONSTRAINT "security_bans_permanent_has_no_expiry" CHECK ("security_bans"."permanent" = ("security_bans"."expires_at" IS NULL)),
	CONSTRAINT "security_bans_expiry_after_start" CHECK ("security_bans"."expires_at" IS NULL OR "security_bans"."expires_at" > "security_bans"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "security_threat_events" ADD CONSTRAINT "security_threat_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "security_bans_actor_idx" ON "security_bans" USING btree ("actor_key");
--> statement-breakpoint
CREATE INDEX "security_bans_active_idx" ON "security_bans" USING btree ("active","expires_at");
--> statement-breakpoint
CREATE INDEX "security_bans_last_strike_idx" ON "security_bans" USING btree ("last_strike_at");
--> statement-breakpoint
CREATE INDEX "security_threat_events_actor_idx" ON "security_threat_events" USING btree ("actor_key","occurred_at");
--> statement-breakpoint
CREATE INDEX "security_threat_events_occurred_idx" ON "security_threat_events" USING btree ("occurred_at");
