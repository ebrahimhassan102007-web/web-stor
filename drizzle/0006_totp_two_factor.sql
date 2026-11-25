CREATE TABLE "user_totp" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "encrypted_secret" varchar(512) NOT NULL,
  "enabled_at" timestamp with time zone,
  "verified_at" timestamp with time zone,
  "last_accepted_counter" integer,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_totp_counter_nonnegative" CHECK ("last_accepted_counter" IS NULL OR "last_accepted_counter" >= 0)
);
--> statement-breakpoint
ALTER TABLE "user_totp" ADD CONSTRAINT "user_totp_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "totp_recovery_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "code_hash" varchar(64) NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "totp_recovery_codes" ADD CONSTRAINT "totp_recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "totp_recovery_codes_hash_idx" ON "totp_recovery_codes" USING btree ("code_hash");
--> statement-breakpoint
CREATE INDEX "totp_recovery_codes_user_idx" ON "totp_recovery_codes" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE "pending_two_factor_challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "auth_method" varchar(8) NOT NULL,
  "return_to" varchar(512) DEFAULT '/account' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "attempts" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "pending_two_factor_auth_method_known" CHECK ("auth_method" IN ('email','google')),
  CONSTRAINT "pending_two_factor_attempts_nonnegative" CHECK ("attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "pending_two_factor_challenges" ADD CONSTRAINT "pending_two_factor_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "pending_two_factor_token_hash_idx" ON "pending_two_factor_challenges" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "pending_two_factor_user_idx" ON "pending_two_factor_challenges" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "pending_two_factor_expiry_idx" ON "pending_two_factor_challenges" USING btree ("expires_at");
