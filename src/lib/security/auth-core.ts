import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const CODE_LENGTH = 6;
const CODE_DIGEST_RE = /^[a-f0-9]{64}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const DUMMY_PASSWORD_HASH =
  "scrypt$16384$8$1$RS1Wb3JhIGR1bW15IHNhbA$MWfVEiQ-3W8yZ9EnYADcKDOfJY1DZhc9ygO8uf02Vz3hIyYe74ehpHVIGsTQzD6BqmGgp-KNt1LcXP43GR1n0A";

type GlobalForAuth = typeof globalThis & { __evoraDevAuthSecret?: string };

/**
 * A separate key protects verification codes (whose search space is only a
 * million values). Production must provide a stable, high-entropy secret.
 */
export function getAuthSecret(): string {
  const configured = process.env.AUTH_SECRET;
  if (configured && configured.length >= 32) return configured;

  if (process.env.NODE_ENV !== "production") {
    const globalForAuth = globalThis as GlobalForAuth;
    if (!globalForAuth.__evoraDevAuthSecret) {
      globalForAuth.__evoraDevAuthSecret = randomBytes(32).toString("hex");
      console.warn(
        "[auth] AUTH_SECRET is not set — using a temporary development key. " +
          "Email verification codes will not survive a server restart.",
      );
    }
    return globalForAuth.__evoraDevAuthSecret;
  }

  throw new Error("AUTH_SECRET must be configured with at least 32 characters");
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Six uniformly selected decimal digits, including leading zeroes. */
export function createVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(CODE_LENGTH, "0");
}

export function hashVerificationCode(
  userId: string,
  code: string,
  secret = getAuthSecret(),
): string {
  return createHmac("sha256", secret)
    .update(`evora-email-code\0${userId}\0${code}`)
    .digest("hex");
}

/** Constant-time comparison of a stored HMAC digest and a candidate code. */
export function verifyVerificationCode(
  userId: string,
  code: string,
  storedDigest: string,
  secret = getAuthSecret(),
): boolean {
  if (!CODE_DIGEST_RE.test(storedDigest) || !/^\d{6}$/.test(code)) return false;
  const expected = Buffer.from(hashVerificationCode(userId, code, secret), "hex");
  const actual = Buffer.from(storedDigest, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** 256-bit opaque token; persist only its one-way SHA-256 digest. */
export function createOpaqueSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function scryptAsync(
  password: string,
  salt: Buffer,
  length: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey as Buffer);
    });
  });
}

/** OWASP-aligned scrypt password hash with a unique 128-bit salt per account. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const digest = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  encodedHash: string | null | undefined,
): Promise<boolean> {
  const stored = encodedHash ?? DUMMY_PASSWORD_HASH;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (
    !Number.isInteger(n) ||
    n !== SCRYPT_N ||
    !Number.isInteger(r) ||
    r !== SCRYPT_R ||
    !Number.isInteger(p) ||
    p !== SCRYPT_P
  ) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64url");
    expected = Buffer.from(parts[5], "base64url");
  } catch {
    return false;
  }
  if (salt.length !== 16 || expected.length !== SCRYPT_KEY_LENGTH) return false;

  const actual = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return timingSafeEqual(actual, expected);
}

/**
 * Only same-origin, relative paths are accepted after an OAuth callback.
 * Query strings are preserved; fragments are discarded because they are not
 * sent to the server. All invalid values fall back to the account page.
 */
export function safeReturnPath(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return "/account";
  }
  try {
    const parsed = new URL(value, "https://evora.invalid");
    if (parsed.origin !== "https://evora.invalid") return "/account";
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/account";
  }
}

/** Constant-time string equality for same-length OAuth state and nonce values. */
export function secureStringEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    leftBytes.length > 0 &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

export function isOpaqueToken(value: string | undefined): value is string {
  return Boolean(value && TOKEN_RE.test(value));
}
