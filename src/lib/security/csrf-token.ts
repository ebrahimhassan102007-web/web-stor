import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/security/csrf-constants";

export { CSRF_COOKIE, CSRF_HEADER };
const TOKEN_RE = /^([A-Za-z0-9_-]{43})\.([a-f0-9]{64})$/;

export function createCsrfToken(secret: string): string {
  const nonce = randomBytes(32).toString("base64url");
  const mac = createHmac("sha256", secret).update(`evora-csrf\0${nonce}`).digest("hex");
  return `${nonce}.${mac}`;
}

export function isValidCsrfToken(token: string, secret: string): boolean {
  const match = TOKEN_RE.exec(token);
  if (!match || secret.length < 32) return false;
  const expected = createHmac("sha256", secret).update(`evora-csrf\0${match[1]}`).digest();
  const actual = Buffer.from(match[2]!, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function verifyDoubleSubmitCsrf(
  cookieToken: string | undefined,
  headerToken: string | null,
  secret: string,
): boolean {
  if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length) return false;
  const cookieBytes = Buffer.from(cookieToken);
  const headerBytes = Buffer.from(headerToken);
  return timingSafeEqual(cookieBytes, headerBytes) && isValidCsrfToken(cookieToken, secret);
}
