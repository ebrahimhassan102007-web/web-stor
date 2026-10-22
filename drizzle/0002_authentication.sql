CREATE TABLE "account_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"key_hash" varchar(64) PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_verification_codes" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_oauth_states" (
	"state_hash" varchar(64) PRIMARY KEY NOT NULL,
	"nonce" varchar(64) NOT NULL,
	"code_verifier" varchar(128) NOT NULL,
	"return_to" varchar(512) DEFAULT '/account' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"display_name" varchar(128) NOT NULL,
	"password_hash" varchar(255),
	"google_sub" varchar(255),
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_codes" ADD CONSTRAINT "email_verification_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_sessions_token_hash_idx" ON "account_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "account_sessions_user_idx" ON "account_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_sessions_expiry_idx" ON "account_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_rate_limits_window_idx" ON "auth_rate_limits" USING btree ("window_started_at");--> statement-breakpoint
CREATE INDEX "email_verification_codes_expiry_idx" ON "email_verification_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "google_oauth_states_expiry_idx" ON "google_oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_sub_idx" ON "users" USING btree ("google_sub");