import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * AES-256-GCM encryption for digital code values at rest.
 *
 * - Key derived from INVENTORY_SECRET (separate from SESSION_SECRET so the
 *   two can be rotated independently).
 * - Every ciphertext uses a fresh random IV; GCM provides integrity.
 * - Plaintext codes exist only transiently in server memory: never in logs,
 *   never in the database, never in client bundles.
 */

function key(): Buffer {
  const secret = process.env.INVENTORY_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("INVENTORY_SECRET is not configured");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptCode(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

export function decryptCode(encrypted: string): string {
  const [ivB64, tagB64, ctB64] = encrypted.split(".");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
