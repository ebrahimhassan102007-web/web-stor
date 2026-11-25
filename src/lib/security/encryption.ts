import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptionKey = { id: string; key: Buffer };
export type AuthenticatedEnvelope = {
  keyId: string;
  ciphertext: string;
  iv: string;
  authTag: string;
};

export function encryptionKeyFromEnv(keyName: string, idName: string): EncryptionKey {
  const id = process.env[idName]?.trim() ?? "";
  const encoded = process.env[keyName]?.trim() ?? "";
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(id)) throw new Error(`${idName} must be configured`);
  let key: Buffer;
  if (/^[a-fA-F0-9]{64}$/.test(encoded)) key = Buffer.from(encoded, "hex");
  else if (/^[A-Za-z0-9_-]{43}$/.test(encoded)) key = Buffer.from(encoded, "base64url");
  else throw new Error(`${keyName} must encode exactly 32 bytes`);
  if (key.length !== 32) throw new Error(`${keyName} must be 32 bytes`);
  return { id, key };
}

export function encryptAes256Gcm(value: string, key: EncryptionKey, purpose: string): AuthenticatedEnvelope {
  if (!value || value.length > 16_384 || !/^[a-z0-9-]{1,48}$/.test(purpose)) throw new Error("Invalid encryption input");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key.key, iv);
  cipher.setAAD(Buffer.from(`${purpose}:v1:${key.id}`));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    keyId: key.id,
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptAes256Gcm(envelope: AuthenticatedEnvelope, key: EncryptionKey, purpose: string): string {
  if (!/^[a-z0-9-]{1,48}$/.test(purpose) || envelope.keyId !== key.id) throw new Error("Encryption key or purpose mismatch");
  const iv = Buffer.from(envelope.iv, "base64url");
  const authTag = Buffer.from(envelope.authTag, "base64url");
  const ciphertext = Buffer.from(envelope.ciphertext, "base64url");
  if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length < 1 || ciphertext.length > 16_384) throw new Error("Invalid encrypted envelope");
  const decipher = createDecipheriv("aes-256-gcm", key.key, iv);
  decipher.setAAD(Buffer.from(`${purpose}:v1:${key.id}`));
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
