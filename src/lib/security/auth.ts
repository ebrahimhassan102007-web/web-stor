import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, lt } from "drizzle-orm";
import { db, sessions, users, type User } from "@/lib/db";

/**
 * Database-backed user sessions.
 *
 * - The cookie holds an opaque 256-bit random token; only its SHA-256 hash
 *   is stored in the database (a DB leak does not yield usable sessions).
 * - A fresh token is minted at every login (session fixation is impossible:
 *   tokens are never accepted from the client for session creation).
 * - Sessions expire server-side; expired rows are rejected and purged
 *   opportunistically.
 * - Cookies: HttpOnly, Secure (production), SameSite=Lax, Path=/.
 */

export const SESSION_COOKIE = "webstor_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export type SafeUser = Pick<User, "id" | "email" | "name" | "role">;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const TOKEN_RE = /^[a-f0-9]{64}$/;

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Creates a session for a user and sets the cookie. Returns nothing secret. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt,
  });

  // Opportunistic cleanup of this user's expired sessions.
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));

  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_MS / 1000));
}

/** Returns the authenticated user for the current request, or null. */
export async function getSessionUser(): Promise<SafeUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token || !TOKEN_RE.test(token)) return null;

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return row ?? null;
}

/** Destroys the current session row and clears the cookie. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token && TOKEN_RE.test(token)) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  store.set(SESSION_COOKIE, "", cookieOptions(0));
}

/** Invalidates every session of a user (used after password reset). */
export async function destroyAllSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Requires an authenticated user. Returns null when unauthenticated. */
export async function requireUser(): Promise<SafeUser | null> {
  return getSessionUser();
}

/** Requires an admin. Returns the user or null (caller must 401/403). */
export async function requireAdmin(): Promise<SafeUser | null> {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return null;
  return user;
}
