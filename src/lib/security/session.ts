import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db, carts } from "@/lib/db";
import { eq } from "drizzle-orm";

/**
 * Cart session management.
 *
 * The cart id is a random UUID stored in an HttpOnly cookie. The cookie value
 * is HMAC-SHA256 signed with SESSION_SECRET so a tampered or forged id is
 * rejected before it ever reaches the database. Cookies are:
 *   - HttpOnly  → unreadable from JavaScript (XSS containment)
 *   - Secure    → HTTPS-only in production
 *   - SameSite=Lax → not sent on cross-site POSTs (CSRF containment)
 */

export const CART_COOKIE = "webstor_cart";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET is not configured");
  }
  return s;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

/** Constant-time signature comparison to prevent timing attacks. */
function verify(value: string, signature: string): boolean {
  const expected = Buffer.from(sign(value), "hex");
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
}

/** Parse + verify the signed cookie. Returns the cart id or null. */
export async function getCartIdFromCookie(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(CART_COOKIE)?.value;
  if (!raw) return null;

  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;

  const id = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!UUID_RE.test(id) || !verify(id, sig)) return null;
  return id;
}

/** Returns the verified cart id if the cart actually exists in the DB. */
export async function getExistingCartId(): Promise<string | null> {
  const id = await getCartIdFromCookie();
  if (!id) return null;
  const [row] = await db
    .select({ id: carts.id })
    .from(carts)
    .where(eq(carts.id, id))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Returns the current cart id, creating a new cart (and setting the signed
 * cookie) when none exists. Only call from contexts that may set cookies
 * (Route Handlers / Server Actions).
 */
export async function getOrCreateCartId(): Promise<string> {
  const existing = await getExistingCartId();
  if (existing) return existing;

  const [created] = await db.insert(carts).values({}).returning({
    id: carts.id,
  });

  const store = await cookies();
  store.set(CART_COOKIE, `${created.id}.${sign(created.id)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });

  return created.id;
}

/** Clears the cart cookie (used after successful checkout). */
export async function clearCartCookie(): Promise<void> {
  const store = await cookies();
  store.set(CART_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
