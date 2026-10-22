import "server-only";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, accountSessions, users } from "@/lib/db";
import {
  createOpaqueSessionToken,
  hashOpaqueToken,
  isOpaqueToken,
} from "@/lib/security/auth-core";

export const ACCOUNT_SESSION_COOKIE = "evora_account_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export type AccountUser = {
  id: string;
  email: string;
  displayName: string;
  emailVerifiedAt: Date | null;
  googleLinked: boolean;
  passwordLoginEnabled: boolean;
  createdAt: Date;
};

export async function getCurrentAccountUser(): Promise<AccountUser | null> {
  const store = await cookies();
  const token = store.get(ACCOUNT_SESSION_COOKIE)?.value;
  if (!isOpaqueToken(token)) return null;

  const now = new Date();
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      emailVerifiedAt: users.emailVerifiedAt,
      googleSub: users.googleSub,
      passwordHash: users.passwordHash,
      createdAt: users.createdAt,
    })
    .from(accountSessions)
    .innerJoin(users, eq(accountSessions.userId, users.id))
    .where(
      and(
        eq(accountSessions.tokenHash, hashOpaqueToken(token)),
        gt(accountSessions.expiresAt, now),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    emailVerifiedAt: row.emailVerifiedAt,
    googleLinked: Boolean(row.googleSub),
    passwordLoginEnabled: Boolean(row.passwordHash),
    createdAt: row.createdAt,
  };
}

/** Issue an opaque, server-side session and rotate any current cookie. */
export async function createAccountSession(userId: string): Promise<void> {
  const store = await cookies();
  const oldToken = store.get(ACCOUNT_SESSION_COOKIE)?.value;
  if (isOpaqueToken(oldToken)) {
    await db
      .delete(accountSessions)
      .where(eq(accountSessions.tokenHash, hashOpaqueToken(oldToken)));
  }

  const token = createOpaqueSessionToken();
  await db
    .delete(accountSessions)
    .where(
      and(
        eq(accountSessions.userId, userId),
        lt(accountSessions.expiresAt, new Date()),
      ),
    );
  await db.insert(accountSessions).values({
    userId,
    tokenHash: hashOpaqueToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

  store.set(ACCOUNT_SESSION_COOKIE, token, cookieOptions(SESSION_TTL_SECONDS));
}

/** Revoke the current database session and expire its browser cookie. */
export async function clearAccountSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(ACCOUNT_SESSION_COOKIE)?.value;
  if (isOpaqueToken(token)) {
    await db
      .delete(accountSessions)
      .where(eq(accountSessions.tokenHash, hashOpaqueToken(token)));
  }
  store.set(ACCOUNT_SESSION_COOKIE, "", cookieOptions(0));
}
