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

/** Throw with every problem listed (used by the startup hook). */
export function assertValidEnv(env: EnvLike = process.env): void {
  const errors = validateEnv(env);
  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join("\n- ")}`);
  }
}
