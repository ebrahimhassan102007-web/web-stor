import { createHmac, timingSafeEqual } from "node:crypto";

export const WALLET_WEBHOOK_MAX_SKEW_SECONDS = 300;

export function verifyWalletWebhookSignature(input: {
  secret: string | undefined;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  nowSeconds?: number;
}): boolean {
  const secret = input.secret?.trim() ?? "";
  if (secret.length < 32 || !input.timestamp || !input.signature || !/^\d{10}$/.test(input.timestamp)) return false;
  const ts = Number(input.timestamp);
  if (!Number.isSafeInteger(ts) || Math.abs((input.nowSeconds ?? Math.floor(Date.now() / 1000)) - ts) > WALLET_WEBHOOK_MAX_SKEW_SECONDS) return false;
  const supplied = input.signature.replace(/^sha256=/i, "");
  if (!/^[a-fA-F0-9]{64}$/.test(supplied)) return false;
  const expected = createHmac("sha256", secret).update(`${input.timestamp}.${input.rawBody}`).digest();
  const actual = Buffer.from(supplied, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
