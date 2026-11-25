import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { decryptAes256Gcm, encryptAes256Gcm, encryptionKeyFromEnv, type AuthenticatedEnvelope } from "@/lib/security/encryption";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const period = 30;
const digits = 6;

export function encodeBase32(bytes: Buffer): string {
  let bits = 0, value = 0, result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { result += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) result += B32[(value << (5 - bits)) & 31];
  return result;
}

export function decodeBase32(text: string): Buffer | null {
  if (!/^[A-Z2-7]+$/.test(text)) return null;
  let bits = 0, value = 0; const out: number[] = [];
  for (const char of text) {
    value = (value << 5) | B32.indexOf(char); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function createTotpSecret(): string { return encodeBase32(randomBytes(20)); }

export function createTotpProvisioningUri(secret: string, email: string): string {
  if (!decodeBase32(secret)) throw new Error("Invalid TOTP secret");
  const issuer = "E-Vora";
  const label = `${issuer}:${email}`;
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${encodeURIComponent(label)}?${params}`;
}

export function totpCodeAt(secret: string, counter: number): string {
  const key = decodeBase32(secret);
  if (!key || !Number.isSafeInteger(counter) || counter < 0) throw new Error("Invalid TOTP input");
  const message = Buffer.alloc(8); message.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac("sha1", key).update(message).digest();
  const offset = hash[hash.length - 1]! & 0x0f;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).toString().padStart(digits, "0");
}

export function matchingTotpCounter(secret: string, code: string, nowMs = Date.now()): number | null {
  if (!/^\d{6}$/.test(code) || !Number.isFinite(nowMs) || nowMs < 0) return null;
  const current = Math.floor(nowMs / 1000 / period);
  const candidate = Buffer.from(code, "ascii");
  let matched: number | null = null;
  for (let offset = -1; offset <= 1; offset++) {
    const counter = current + offset;
    if (counter < 0) continue;
    const expected = Buffer.from(totpCodeAt(secret, counter), "ascii");
    if (timingSafeEqual(expected, candidate)) matched = counter;
  }
  return matched;
}

export function isTotpCounterFresh(counter: number | null, lastAcceptedCounter: number | null): boolean {
  return counter !== null && Number.isSafeInteger(counter) && counter >= 0 &&
    (lastAcceptedCounter === null || counter > lastAcceptedCounter);
}

export function verifyTotpCode(secret: string, code: string, nowMs = Date.now()): boolean {
  return matchingTotpCounter(secret, code, nowMs) !== null;
}

function totpEncryptionKey() {
  return encryptionKeyFromEnv("TOTP_ENCRYPTION_KEY", "TOTP_ENCRYPTION_KEY_ID");
}

export function encryptTotpSecret(secret: string): string {
  if (!decodeBase32(secret)) throw new Error("Invalid TOTP secret");
  const envelope = encryptAes256Gcm(secret, totpEncryptionKey(), "evora-totp");
  return ["v1", envelope.keyId, envelope.iv, envelope.authTag, envelope.ciphertext].join(".");
}

export function decryptTotpSecret(value: string): string {
  const [version, keyId, iv, authTag, ciphertext, ...extra] = value.split(".");
  if (version !== "v1" || !keyId || !iv || !authTag || !ciphertext || extra.length) throw new Error("Invalid TOTP envelope");
  const envelope: AuthenticatedEnvelope = { keyId, iv, authTag, ciphertext };
  const plain = decryptAes256Gcm(envelope, totpEncryptionKey(), "evora-totp");
  if (!decodeBase32(plain)) throw new Error("Invalid TOTP secret payload");
  return plain;
}

export function createRecoveryCodes(count = 10): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error("Invalid recovery code count");
  return Array.from({ length: count }, () => randomBytes(10).toString("hex").toUpperCase());
}

export function hashRecoveryCode(code: string, secret: string): string {
  const normalized = code.replace(/[- ]/g, "").toUpperCase();
  if (!/^[A-F0-9]{20}$/.test(normalized)) throw new Error("Invalid recovery code");
  return createHmac("sha256", secret).update(`evora-recovery-code\0${normalized}`).digest("hex");
}

export function verifyRecoveryCode(code: string, digest: string, secret: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(digest)) return false;
  let candidate: string;
  try { candidate = hashRecoveryCode(code, secret); } catch { return false; }
  return timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(digest, "hex"));
}
