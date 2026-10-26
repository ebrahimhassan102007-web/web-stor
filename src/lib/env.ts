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
