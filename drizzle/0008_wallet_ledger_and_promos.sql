CREATE TABLE wallet_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_cents integer NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  currency varchar(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE wallet_ledger (
  id serial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  entry_type varchar(16) NOT NULL CHECK (entry_type IN ('credit_topup','debit_order','credit_refund','adjustment')),
  direction varchar(6) NOT NULL CHECK (direction IN ('credit','debit')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency varchar(3) NOT NULL CHECK (currency = 'USD'),
  order_id uuid REFERENCES orders(id) ON DELETE RESTRICT,
  idempotency_key varchar(160) NOT NULL,
  description varchar(160) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_ledger_type_direction CHECK ((entry_type = 'debit_order' AND direction = 'debit') OR (entry_type <> 'debit_order' AND direction = 'credit'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX wallet_ledger_idempotency_idx ON wallet_ledger(idempotency_key);
--> statement-breakpoint
CREATE INDEX wallet_ledger_user_created_idx ON wallet_ledger(user_id, created_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX wallet_ledger_order_idx ON wallet_ledger(order_id);
--> statement-breakpoint

-- Guard against accidental UPDATE/DELETE: balances are corrected only by new entries.
CREATE FUNCTION reject_wallet_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'wallet ledger is immutable'; END;
$$;
--> statement-breakpoint
CREATE TRIGGER wallet_ledger_immutable BEFORE UPDATE OR DELETE ON wallet_ledger FOR EACH ROW EXECUTE FUNCTION reject_wallet_ledger_mutation();
--> statement-breakpoint

CREATE TABLE promo_codes (
  id serial PRIMARY KEY,
  code varchar(32) NOT NULL CHECK (code = upper(btrim(code))),
  description varchar(160) NOT NULL DEFAULT '',
  description_ar varchar(160) NOT NULL DEFAULT '',
  discount_type varchar(16) NOT NULL CHECK (discount_type IN ('percentage','fixed_cents')),
  discount_value integer NOT NULL CHECK (discount_value > 0),
  min_subtotal_cents integer NOT NULL DEFAULT 0 CHECK (min_subtotal_cents >= 0),
  max_discount_cents integer CHECK (max_discount_cents IS NULL OR max_discount_cents > 0),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  per_user_limit integer NOT NULL DEFAULT 1 CHECK (per_user_limit > 0),
  is_active boolean NOT NULL DEFAULT false,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_codes_discount_bounds CHECK ((discount_type = 'percentage' AND discount_value <= 10000) OR discount_type = 'fixed_cents'),
  CONSTRAINT promo_codes_expiry_after_start CHECK (expires_at IS NULL OR expires_at > starts_at)
);
--> statement-breakpoint
CREATE UNIQUE INDEX promo_codes_code_idx ON promo_codes(code);
--> statement-breakpoint
CREATE INDEX promo_codes_public_active_idx ON promo_codes(is_public, is_active, starts_at);
--> statement-breakpoint

ALTER TABLE orders ADD COLUMN promo_code_id integer;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN discount_cents integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_discount_nonnegative CHECK (discount_cents >= 0);
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_discount_within_subtotal CHECK (discount_cents <= subtotal_cents);
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_promo_code_id_promo_codes_id_fk FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX orders_promo_code_idx ON orders(promo_code_id);
--> statement-breakpoint

CREATE TABLE promo_redemptions (
  id serial PRIMARY KEY,
  promo_code_id integer NOT NULL REFERENCES promo_codes(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  redeemer_key varchar(64) NOT NULL,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  discount_cents integer NOT NULL CHECK (discount_cents > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX promo_redemptions_order_idx ON promo_redemptions(order_id);
--> statement-breakpoint
CREATE INDEX promo_redemptions_user_idx ON promo_redemptions(promo_code_id, user_id);
--> statement-breakpoint
CREATE INDEX promo_redemptions_key_idx ON promo_redemptions(promo_code_id, redeemer_key);
--> statement-breakpoint
