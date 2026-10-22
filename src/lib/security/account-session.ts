import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";

export const ACCOUNT_COOKIE = "webstor_account";
const TTL_SECONDS = 60 * 60 * 24 * 7;
const TTL_MS = TTL_SECONDS * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET is not configured");
  return value;
}
function sign(payload: string): string {
  return createHmac("sha256", secret()).update("account-session:v1." + payload).digest("hex");
}
export function makeAccountSessionCookie(userId: string) {
  const payload = Buffer.from(JSON.stringify({
    userId, expiresAt: Date.now() + TTL_MS, version: 1,
  }), "utf8").toString("base64url");
  return {
    name: ACCOUNT_COOKIE,
    value: payload + "." + sign(payload),
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: TTL_SECONDS,
    },
  };
}
function validSignature(payload: string, supplied: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(supplied)) return false;
  const expected = Buffer.from(sign(payload), "hex");
  const actual = Buffer.from(supplied, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function getCurrentAccountUser() {
  const raw = (await cookies()).get(ACCOUNT_COOKIE)?.value;
  if (!raw || raw.length > 2048) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  try {
    if (!validSignature(payload, raw.slice(dot + 1))) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId?: unknown; expiresAt?: unknown; version?: unknown;
    };
    if (
      decoded.version !== 1 || typeof decoded.userId !== "string" ||
      !UUID_RE.test(decoded.userId) || typeof decoded.expiresAt !== "number" ||
      !Number.isSafeInteger(decoded.expiresAt) || decoded.expiresAt <= Date.now() ||
      decoded.expiresAt > Date.now() + TTL_MS + 60_000
    ) return null;
    const [user] = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
    return user ?? null;
  } catch {
    return null;
  }
}
