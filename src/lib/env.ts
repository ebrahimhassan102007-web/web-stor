/**
 * Boot-time environment validation (S-17). In production the process fails
 * fast on missing/short secrets, a malformed APP_ORIGIN, or partial
 * SMTP/Google configuration — instead of failing halfway through a request
 * or silently degrading security. Development keeps working with the
 * documented ephemeral fallbacks.
 */
export type EnvLike = Record<string, string | undefined>;

export function validateEnv(env: EnvLike = process.env): string[] {
  const errors: string[] = [];
  const isProd = env.NODE_ENV === "production";

  const secret = (name: string, minLength: number) => {
    const value = env[name]?.trim() ?? "";
    if (isProd && value.length < minLength) {
      errors.push(`${name} must be set to at least ${minLength} characters in production`);
    }
  };
  secret("SESSION_SECRET", 32);
  secret("AUTH_SECRET", 32);
  const walletWebhookSecret = env.WALLET_TOPUP_WEBHOOK_SECRET?.trim() ?? "";
  if (isProd && walletWebhookSecret.length < 32) errors.push("WALLET_TOPUP_WEBHOOK_SECRET must be set to at least 32 characters in production");
  const totpKey = env.TOTP_ENCRYPTION_KEY?.trim() ?? "";
  const totpKeyId = env.TOTP_ENCRYPTION_KEY_ID?.trim() ?? "";
  if (isProd && (!totpKey || !totpKeyId)) errors.push("TOTP_ENCRYPTION_KEY and TOTP_ENCRYPTION_KEY_ID are required in production");
  if (totpKey && !/^(?:[a-fA-F0-9]{64}|[A-Za-z0-9_-]{43})$/.test(totpKey)) errors.push("TOTP_ENCRYPTION_KEY must encode exactly 32 bytes as hex or base64url");
  if (totpKeyId && !/^[A-Za-z0-9._-]{1,64}$/.test(totpKeyId)) errors.push("TOTP_ENCRYPTION_KEY_ID is invalid");
  if (Boolean(totpKey) !== Boolean(totpKeyId)) errors.push("TOTP key and key id must be configured together");
  const fulfillmentKey = env.FULFILLMENT_ENCRYPTION_KEY?.trim() ?? "";
  const fulfillmentKeyId = env.FULFILLMENT_ENCRYPTION_KEY_ID?.trim() ?? "";
  if (isProd && (!fulfillmentKey || !fulfillmentKeyId)) errors.push("FULFILLMENT_ENCRYPTION_KEY and FULFILLMENT_ENCRYPTION_KEY_ID are required in production");
  if (fulfillmentKey && !/^(?:[a-fA-F0-9]{64}|[A-Za-z0-9_-]{43})$/.test(fulfillmentKey)) errors.push("FULFILLMENT_ENCRYPTION_KEY must encode exactly 32 bytes as hex or base64url");
  if (fulfillmentKeyId && !/^[A-Za-z0-9._-]{1,64}$/.test(fulfillmentKeyId)) errors.push("FULFILLMENT_ENCRYPTION_KEY_ID is invalid");
  if (Boolean(fulfillmentKey) !== Boolean(fulfillmentKeyId)) errors.push("Fulfillment key and key id must be configured together");

  // S-26 split-key vault v2. `VAULT_MASTER_KEY` is the mandatory KEK seed;
  // `VAULT_KEY_PEPPER` is an OPTIONAL second split share, so a single leaked
  // environment value can never rebuild the wrapping key. Production fails
  // closed without the master key and the key id that identifies it.
  const vaultKey = env.VAULT_MASTER_KEY?.trim() ?? "";
  const vaultKeyId = env.VAULT_MASTER_KEY_ID?.trim() ?? "";
  const vaultPepper = env.VAULT_KEY_PEPPER?.trim() ?? "";
  const VAULT_KEY_SHAPE = /^(?:[a-fA-F0-9]{64}|[A-Za-z0-9_-]{43})$/;
  if (isProd && !vaultKey) {
    errors.push("VAULT_MASTER_KEY is required in production (split-key digital vault)");
  }
  if (isProd && !vaultKeyId) {
    errors.push("VAULT_MASTER_KEY_ID is required in production (split-key digital vault)");
  }
  if (vaultKey && !VAULT_KEY_SHAPE.test(vaultKey)) {
    errors.push("VAULT_MASTER_KEY must encode exactly 32 bytes as hex or base64url");
  }
  if (vaultKeyId && !/^[A-Za-z0-9._-]{1,64}$/.test(vaultKeyId)) errors.push("VAULT_MASTER_KEY_ID is invalid");
  if (Boolean(vaultKey) !== Boolean(vaultKeyId)) errors.push("Vault master key and key id must be configured together");
  if (vaultPepper && !VAULT_KEY_SHAPE.test(vaultPepper)) {
    errors.push("VAULT_KEY_PEPPER must encode exactly 32 bytes as hex or base64url");
  }

  if (isProd && !env.DATABASE_URL?.trim()) {
    errors.push("DATABASE_URL must be set in production");
  }

  const origin = env.APP_ORIGIN?.trim();
  if (isProd && !origin) errors.push("APP_ORIGIN must be set in production");
  if (origin) {
    try {
      const url = new URL(origin);
      if (url.pathname !== "/" && url.pathname !== "") {
        errors.push("APP_ORIGIN must be an origin without a path");
      }
      if (isProd && url.protocol !== "https:" && url.hostname !== "localhost") {
        errors.push("APP_ORIGIN must use https in production");
      }
    } catch {
      errors.push("APP_ORIGIN is not a valid URL");
    }
  }

  const smtpKeys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"];
  const smtpSet = smtpKeys.filter((k) => env[k]?.trim());
  if (smtpSet.length > 0 && smtpSet.length < smtpKeys.length) {
    errors.push(`Partial SMTP configuration: set all of ${smtpKeys.join(", ")} or none`);
  }

  const googleSet = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"].filter((k) => env[k]?.trim());
  if (googleSet.length === 1) {
    errors.push("Partial Google configuration: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET together");
  }

  const checkoutMode = env.CHECKOUT_MODE?.trim().toLowerCase();
  if (checkoutMode && checkoutMode !== "demo" && checkoutMode !== "disabled") {
    errors.push("CHECKOUT_MODE must be 'demo' or 'disabled'");
  }
  if (isProd && checkoutMode === "demo") {
    errors.push("CHECKOUT_MODE=demo is refused in production (no payment provider)");
  }

  return errors;
}

/**
 * True only inside `next build`.
 *
 * Next.js sets `NEXT_PHASE=phase-production-build` for the build worker, which
 * may evaluate route modules while collecting page data. A *build* is not a
 * *deployment*: on Vercel the build runs before runtime secrets are guaranteed
 * to be injected, and a throw here would turn a perfectly deployable commit
 * into a failed build.
 */
export function isBuildPhase(env: EnvLike = process.env): boolean {
  return env.NEXT_PHASE === "phase-production-build";
}

/**
 * Throw with every problem listed (used by the startup hook).
 *
 * Strict validation is deliberately deferred from build to **server start**:
 *  - during `next build` this is a no-op, so no page/route module evaluated for
 *    prerendering can crash the build over a runtime-only secret;
 *  - at runtime (every serverless cold start, every `next start`) validation
 *    still runs and still fails closed — there is no insecure fallback path.
 *
 * `validateEnv()` itself is unchanged and stays pure so the rules can be tested
 * (and reported) independently of the phase.
 */
export function assertValidEnv(env: EnvLike = process.env): void {
  if (isBuildPhase(env)) return;
  const errors = validateEnv(env);
  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join("\n- ")}`);
  }
}
