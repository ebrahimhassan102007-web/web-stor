import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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

function getEncryptionKey(): { id: string; key: Buffer } {
  const id = process.env.TOTP_ENCRYPTION_KEY_ID?.trim() ?? "";
  const encoded = process.env.TOTP_ENCRYPTION_KEY?.trim() ?? "";
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(id)) throw new Error("TOTP_ENCRYPTION_KEY_ID must be configured");
  let key: Buffer;
  if (/^[a-fA-F0-9]{64}$/.test(encoded)) key = Buffer.from(encoded, "hex");
  else if (/^[A-Za-z0-9_-]{43}$/.test(encoded)) key = Buffer.from(encoded, "base64url");
  else throw new Error("TOTP_ENCRYPTION_KEY must encode 32 bytes");
  if (key.length !== 32) throw new Error("TOTP_ENCRYPTION_KEY must be 32 bytes");
  return { id, key };
}

export function encryptTotpSecret(secret: string): string {
  if (!decodeBase32(secret)) throw new Error("Invalid TOTP secret");
  const { id, key } = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`evora-totp:v1:${id}`));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", id, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptTotpSecret(value: string): string {
  const [version, id, ivText, tagText, encrypted, ...extra] = value.split(".");
  if (version !== "v1" || !id || !ivText || !tagText || !encrypted || extra.length) throw new Error("Invalid TOTP envelope");
  const configured = getEncryptionKey();
  if (configured.id !== id) throw new Error("TOTP encryption key id mismatch");
  const iv = Buffer.from(ivText, "base64url"), tag = Buffer.from(tagText, "base64url"), ciphertext = Buffer.from(encrypted, "base64url");
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 1 || ciphertext.length > 128) throw new Error("Invalid TOTP envelope");
  const decipher = createDecipheriv("aes-256-gcm", configured.key, iv);
  decipher.setAAD(Buffer.from(`evora-totp:v1:${id}`)); decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
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
