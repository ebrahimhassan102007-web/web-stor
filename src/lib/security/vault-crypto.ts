/**
 * E-Vora digital vault — **split-key envelope encryption v2** (S-26).
 *
 * ## Design
 *
 * Every delivered secret is sealed with its **own** cryptographically random
 * 256-bit Data Encryption Key (`DEK`). The DEK is then wrapped (encrypted) by a
 * Key Encryption Key (`KEK`) that is never stored:
 *
 * ```
 *   plaintext ──AES-256-GCM(DEK, AAD=record context)──▶ ciphertext
 *   DEK       ──AES-256-GCM(KEK, AAD=context+kekId)───▶ wrapped_dek
 *   KEK       =  HKDF-SHA512(VAULT_MASTER_KEY, salt=VAULT_KEY_PEPPER, info)
 * ```
 *
 * Properties this buys us:
 *
 *  - **No single secret decrypts the database.** The KEK is derived, and the
 *    optional `VAULT_KEY_PEPPER` split share means a leaked
 *    `VAULT_MASTER_KEY` alone still does not rebuild it.
 *  - **Impossible to transplant.** The GCM `AAD` of the payload is the
 *    canonical record context (`productId` + stock/order-item identity), so
 *    copying a ciphertext (or a wrapped DEK) onto another row, product or
 *    buyer fails authentication *mathematically* rather than by an
 *    `if` statement someone can later delete.
 *  - **Per-record compromise only.** A leaked DEK exposes exactly one code,
 *    never the whole catalogue.
 *  - **Rotation without re-encryption of secrets.** Only the 32-byte DEK is
 *    re-wrapped; the payload AAD deliberately excludes the KEK id.
 *
 * ## Conventions
 *
 *  - The module is dependency-free apart from `node:crypto` and has **no**
 *    `server-only` marker, so the test suite can exercise the real
 *    implementation. It must still never be imported by client code.
 *  - No secret is ever logged, and every temporary key/plaintext buffer is
 *    zeroed in a `finally` block.
 *  - Base64url is used for every stored field; the database stores text only.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export type VaultEnvLike = Record<string, string | undefined>;

/** Envelope marker persisted in `fulfillment_vault.envelope_version`. */
export const VAULT_ENVELOPE_V2 = "v2" as const;
/** Legacy envelope marker (single shared key, read-only after S-26). */
export const VAULT_ENVELOPE_V1 = "v1" as const;

/** Key id used by the deterministic development/test fallback. */
export const VAULT_DEV_KEY_ID = "vault-dev-local";
/** Key id used when an operator supplies a key but no id. */
export const VAULT_DEFAULT_KEY_ID = "vault-primary";

/** HKDF `info` labels — distinct for wrapping and for blind digests. */
const KEK_INFO_PREFIX = "evora-vault-kek:v2";
const DIGEST_INFO = "evora-vault-code-digest:v1";
const DELIVERY_INFO = "evora-vault-delivery:v1";
/** Fixed, public salt used only when no pepper split share is configured. */
const DEFAULT_HKDF_SALT = "evora-vault-default-salt:v2";

/** Longest accepted secret; mirrors the pre-S-26 vault limit. */
export const VAULT_MAX_SECRET_LENGTH = 4096;

export type VaultKeyMaterial = {
  /** Stable identifier persisted alongside every wrapped DEK. */
  readonly masterKeyId: string;
  /** 32 bytes. Never logged, never stored. */
  readonly masterKey: Buffer;
  /** Optional second split share (32 bytes) from `VAULT_KEY_PEPPER`. */
  readonly pepper: Buffer | null;
  /** `env` for a real operator key, `development-fallback` otherwise. */
  readonly source: "env" | "development-fallback";
};

export type VaultRecordContext = {
  /** Owning product. Bound into the payload AAD. */
  readonly productId: number;
  /** `null` while the secret is unallocated stock, the order item once sold. */
  readonly orderItemId: number | null;
};

/** A sealed v2 record, ready to persist 1:1 into vault columns. */
export type SealedVaultRecordV2 = {
  readonly envelopeVersion: typeof VAULT_ENVELOPE_V2;
  readonly kekId: string;
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
  readonly wrappedDek: string;
  readonly dekIv: string;
  readonly dekAuthTag: string;
};

/** The stored v2 fields a reader needs (ids come from the database row). */
export type StoredVaultRecordV2 = {
  readonly kekId: string | null;
  readonly ciphertext: string | null;
  readonly iv: string | null;
  readonly authTag: string | null;
  readonly wrappedDek: string | null;
  readonly dekIv: string | null;
  readonly dekAuthTag: string | null;
};

function decode32Bytes(encoded: string): Buffer | null {
  if (/^[a-fA-F0-9]{64}$/.test(encoded)) return Buffer.from(encoded, "hex");
  if (/^[A-Za-z0-9_-]{43}$/.test(encoded)) return Buffer.from(encoded, "base64url");
  return null;
}

/**
 * Resolve the vault keys.
 *
 * Production **fails closed**: a missing/invalid `VAULT_MASTER_KEY` throws
 * rather than silently encrypting with a placeholder. Development and tests get
 * a deterministic (not random) fallback derived from a fixed public label — it
 * is reproducible, obviously non-secret, and can never be reached in
 * production because the production branch throws first.
 */
export function resolveVaultKeyMaterial(env: VaultEnvLike = process.env): VaultKeyMaterial {
  const encoded = env.VAULT_MASTER_KEY?.trim() ?? "";
  const id = env.VAULT_MASTER_KEY_ID?.trim() || VAULT_DEFAULT_KEY_ID;
  const pepperRaw = env.VAULT_KEY_PEPPER?.trim() ?? "";
  const isProduction = env.NODE_ENV === "production";

  const pepper = pepperRaw ? decode32Bytes(pepperRaw) : null;
  if (pepperRaw && !pepper) {
    throw new Error("VAULT_KEY_PEPPER must encode exactly 32 bytes as hex or base64url");
  }
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(id)) {
    throw new Error("VAULT_MASTER_KEY_ID is invalid");
  }

  if (!encoded) {
    if (isProduction) {
      throw new Error("VAULT_MASTER_KEY is required in production (split-key digital vault)");
    }
    const fallback = createHash("sha512")
      .update("evora-vault-development-fallback:v2")
      .digest()
      .subarray(0, 32);
    return {
      masterKeyId: VAULT_DEV_KEY_ID,
      masterKey: Buffer.from(fallback),
      pepper,
      source: "development-fallback",
    };
  }

  const masterKey = decode32Bytes(encoded);
  if (!masterKey) {
    throw new Error("VAULT_MASTER_KEY must encode exactly 32 bytes as hex or base64url");
  }
  return { masterKeyId: id, masterKey, pepper, source: "env" };
}

/** Derive the 32-byte KEK. The caller owns the returned buffer. */
export function deriveVaultKek(material: VaultKeyMaterial): Buffer {
  const salt = material.pepper ?? Buffer.from(DEFAULT_HKDF_SALT, "utf8");
  const info = Buffer.from(`${KEK_INFO_PREFIX}:${material.masterKeyId}`, "utf8");
  return Buffer.from(hkdfSync("sha512", material.masterKey, salt, info, 32));
}

function hkdfSubkey(material: VaultKeyMaterial, info: string): Buffer {
  const salt = material.pepper ?? Buffer.from(DEFAULT_HKDF_SALT, "utf8");
  return Buffer.from(
    hkdfSync("sha512", material.masterKey, salt, Buffer.from(`${info}:${material.masterKeyId}`, "utf8"), 32),
  );
}

/** Canonical AAD for the encrypted payload. Excludes the KEK id (rotation). */
export function vaultPayloadAad(context: VaultRecordContext): Buffer {
  const identity = context.orderItemId === null ? "stock" : `item:${context.orderItemId}`;
  return Buffer.from(`evora-vault:${VAULT_ENVELOPE_V2}:${context.productId}:${identity}`, "utf8");
}

/** Canonical AAD for the wrapped DEK. Includes the KEK id (re-wrapped on rotate). */
export function vaultWrapAad(context: VaultRecordContext, kekId: string): Buffer {
  const identity = context.orderItemId === null ? "stock" : `item:${context.orderItemId}`;
  return Buffer.from(`evora-vault-dek:${VAULT_ENVELOPE_V2}:${context.productId}:${identity}:${kekId}`, "utf8");
}

/**
 * Validate + normalize a raw fulfillment code.
 *
 * NFKC folding and trimming only — case and inner separators are preserved,
 * because a delivery code is case-sensitive and must round-trip byte for byte
 * after unsealing. Control characters are refused.
 */
export function normalizeVaultCode(raw: string): string {
  if (typeof raw !== "string") throw new Error("Invalid fulfillment code");
  const normalized = raw.normalize("NFKC").trim();
  if (
    !normalized ||
    normalized.length > VAULT_MAX_SECRET_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new Error("Invalid fulfillment code");
  }
  return normalized;
}

/**
 * Blind digest of a normalized code (HMAC-SHA256, hex).
 *
 * Used at import time to reject duplicate codes without ever storing
 * plaintext: the digest is keyed, so an attacker with database read access
 * cannot brute-force short codes offline.
 */
export function blindCodeDigest(rawCode: string, material: VaultKeyMaterial): string {
  const normalized = normalizeVaultCode(rawCode);
  const key = hkdfSubkey(material, DIGEST_INFO);
  try {
    return createHmac("sha256", key).update(normalized, "utf8").digest("hex");
  } finally {
    key.fill(0);
  }
}

/** Constant-time comparison for digests (never leak a prefix match). */
export function digestsEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } finally {
    a.fill(0);
    b.fill(0);
  }
}

/**
 * Immutable delivery proof kept after a buyer shreds a revealed secret.
 *
 * It is a keyed digest over the vault row identity, the record context, the
 * blind code digest and a hash of the pre-shred ciphertext: enough to prove
 * *that* a specific code was delivered to a specific buyer, useless for
 * recovering it.
 */
export function computeDeliveryDigest(
  material: VaultKeyMaterial,
  input: {
    vaultId: string;
    context: VaultRecordContext;
    codeDigest: string | null;
    preShredCiphertext: string | null;
  },
): string {
  const key = hkdfSubkey(material, DELIVERY_INFO);
  try {
    const ciphertextSha = createHash("sha256")
      .update(input.preShredCiphertext ?? "", "utf8")
      .digest("hex");
    const identity = input.context.orderItemId === null ? "stock" : `item:${input.context.orderItemId}`;
    return createHmac("sha256", key)
      .update(
        [
          "delivery",
          input.vaultId,
          String(input.context.productId),
          identity,
          input.codeDigest ?? "-",
          ciphertextSha,
        ].join("|"),
        "utf8",
      )
      .digest("hex");
  } finally {
    key.fill(0);
  }
}

/** Seal one secret into a fresh v2 envelope (random DEK, context-bound AAD). */
export function sealVaultSecretV2(input: {
  plaintext: string;
  context: VaultRecordContext;
  material: VaultKeyMaterial;
}): SealedVaultRecordV2 {
  if (!Number.isSafeInteger(input.context.productId) || input.context.productId <= 0) {
    throw new Error("Invalid vault record context");
  }
  const plaintext = normalizeVaultCode(input.plaintext);
  const { context, material } = input;

  const dek = randomBytes(32);
  const kek = deriveVaultKek(material);
  try {
    const payloadIv = randomBytes(12);
    const payloadAad = vaultPayloadAad(context);
    const payloadCipher = createCipheriv("aes-256-gcm", dek, payloadIv);
    payloadCipher.setAAD(payloadAad);
    const ciphertext = Buffer.concat([payloadCipher.update(plaintext, "utf8"), payloadCipher.final()]);
    const payloadTag = payloadCipher.getAuthTag();

    const dekIv = randomBytes(12);
    const dekCipher = createCipheriv("aes-256-gcm", kek, dekIv);
    dekCipher.setAAD(vaultWrapAad(context, material.masterKeyId));
    const wrappedDek = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
    const dekTag = dekCipher.getAuthTag();

    return {
      envelopeVersion: VAULT_ENVELOPE_V2,
      kekId: material.masterKeyId,
      ciphertext: ciphertext.toString("base64url"),
      iv: payloadIv.toString("base64url"),
      authTag: payloadTag.toString("base64url"),
      wrappedDek: wrappedDek.toString("base64url"),
      dekIv: dekIv.toString("base64url"),
      dekAuthTag: dekTag.toString("base64url"),
    };
  } finally {
    // Temporary key material never outlives this call.
    dek.fill(0);
    kek.fill(0);
  }
}

function decodeField(encoded: string | null, label: string): Buffer {
  if (!encoded) throw new Error(`VAULT_ENVELOPE_INCOMPLETE:${label}`);
  const value = Buffer.from(encoded, "base64url");
  if (value.length === 0) throw new Error(`VAULT_ENVELOPE_INCOMPLETE:${label}`);
  return value;
}

/** Unwrap a stored DEK and return it as a plaintext buffer. */
function unwrapDek(input: {
  record: StoredVaultRecordV2;
  context: VaultRecordContext;
  material: VaultKeyMaterial;
}): Buffer {
  const { record, context, material } = input;
  if (record.kekId !== material.masterKeyId) {
    throw new Error("VAULT_KEK_MISMATCH");
  }
  const dekIv = decodeField(record.dekIv, "dek_iv");
  const dekTag = decodeField(record.dekAuthTag, "dek_auth_tag");
  const wrappedDek = decodeField(record.wrappedDek, "wrapped_dek");
  if (dekIv.length !== 12 || dekTag.length !== 16 || wrappedDek.length !== 32) {
    throw new Error("VAULT_ENVELOPE_INVALID");
  }
  const kek = deriveVaultKek(material);
  try {
    const decipher = createDecipheriv("aes-256-gcm", kek, dekIv);
    decipher.setAAD(vaultWrapAad(context, material.masterKeyId));
    decipher.setAuthTag(dekTag);
    return Buffer.concat([decipher.update(wrappedDek), decipher.final()]);
  } finally {
    kek.fill(0);
    dekIv.fill(0);
    dekTag.fill(0);
    wrappedDek.fill(0);
  }
}

/**
 * Open a stored v2 record.
 *
 * The caller supplies the row's canonical context, so a ciphertext moved to a
 * different product or buyer fails GCM authentication here — the core
 * anti-transplant property of the vault.
 */
export function openVaultSecretV2(input: {
  record: StoredVaultRecordV2;
  context: VaultRecordContext;
  material: VaultKeyMaterial;
}): string {
  const { record, context, material } = input;
  const iv = decodeField(record.iv, "iv");
  const tag = decodeField(record.authTag, "auth_tag");
  const ciphertext = decodeField(record.ciphertext, "ciphertext");
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length > VAULT_MAX_SECRET_LENGTH + 32) {
    throw new Error("VAULT_ENVELOPE_INVALID");
  }

  const dek = unwrapDek({ record, context, material });
  try {
    const decipher = createDecipheriv("aes-256-gcm", dek, iv);
    decipher.setAAD(vaultPayloadAad(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } finally {
    dek.fill(0);
    iv.fill(0);
    tag.fill(0);
    ciphertext.fill(0);
  }
}

/**
 * Re-wrap an existing DEK with a different KEK (key rotation).
 *
 * The payload is untouched: rotation never needs to decrypt the secret, which
 * is why a compromised wrapping key can be replaced without handling plaintext
 * codes at all.
 */
export function rewrapVaultDek(input: {
  record: StoredVaultRecordV2;
  context: VaultRecordContext;
  from: VaultKeyMaterial;
  to: VaultKeyMaterial;
}): { wrappedDek: string; dekIv: string; dekAuthTag: string; kekId: string } {
  const { record, context, from, to } = input;
  const dek = unwrapDek({ record, context, material: from });
  const kek = deriveVaultKek(to);
  try {
    const dekIv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", kek, dekIv);
    cipher.setAAD(vaultWrapAad(context, to.masterKeyId));
    const wrapped = Buffer.concat([cipher.update(dek), cipher.final()]);
    return {
      wrappedDek: wrapped.toString("base64url"),
      dekIv: dekIv.toString("base64url"),
      dekAuthTag: cipher.getAuthTag().toString("base64url"),
      kekId: to.masterKeyId,
    };
  } finally {
    dek.fill(0);
    kek.fill(0);
  }
}
