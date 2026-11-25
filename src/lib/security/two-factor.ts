import "server-only";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { accountSessions, db, pendingTwoFactorChallenges, totpRecoveryCodes, userTotp } from "@/lib/db";
import { createOpaqueSessionToken, hashOpaqueToken, getAuthSecret, isOpaqueToken } from "@/lib/security/auth-core";
import { createRecoveryCodes, createTotpProvisioningUri, createTotpSecret, decryptTotpSecret, encryptTotpSecret, hashRecoveryCode, isTotpCounterFresh, matchingTotpCounter } from "@/lib/security/totp";

export const TWO_FACTOR_COOKIE = "evora_pending_2fa";
export const TWO_FACTOR_TTL_SECONDS = 8 * 60;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function pendingCookieOptions(maxAge: number) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
}

export async function isTwoFactorEnabled(userId: string): Promise<boolean> {
  const [row] = await db.select({ enabledAt: userTotp.enabledAt, verifiedAt: userTotp.verifiedAt }).from(userTotp).where(eq(userTotp.userId, userId)).limit(1);
  return Boolean(row?.enabledAt && row.verifiedAt);
}

export async function startTwoFactorChallenge(userId: string, authMethod: "email" | "google", returnTo: string): Promise<void> {
  const token = createOpaqueSessionToken();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.delete(pendingTwoFactorChallenges).where(and(eq(pendingTwoFactorChallenges.userId, userId), isNull(pendingTwoFactorChallenges.consumedAt)));
    await tx.insert(pendingTwoFactorChallenges).values({
      userId, tokenHash: hashOpaqueToken(token), authMethod, returnTo,
      expiresAt: new Date(now.getTime() + TWO_FACTOR_TTL_SECONDS * 1000),
    });
  });
  const store = await cookies();
  store.set(TWO_FACTOR_COOKIE, token, pendingCookieOptions(TWO_FACTOR_TTL_SECONDS));
}

export async function clearTwoFactorChallengeCookie(): Promise<void> {
  const store = await cookies();
  store.set(TWO_FACTOR_COOKIE, "", pendingCookieOptions(0));
}

export async function setupTotp(userId: string, email: string): Promise<{ secret: string; uri: string }> {
  const secret = createTotpSecret();
  const encryptedSecret = encryptTotpSecret(secret);
  const saved = await db.insert(userTotp).values({ userId, encryptedSecret, enabledAt: null, lastAcceptedCounter: null, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userTotp.userId,
      set: { encryptedSecret, enabledAt: null, verifiedAt: null, lastAcceptedCounter: null, updatedAt: new Date() },
      setWhere: isNull(userTotp.enabledAt),
    }).returning({ userId: userTotp.userId });
  if (!saved.length) throw new Error("TOTP_ALREADY_ENABLED");
  return { secret, uri: createTotpProvisioningUri(secret, email) };
}

export async function enableTotp(userId: string, code: string): Promise<string[] | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(userTotp).where(eq(userTotp.userId, userId)).for("update").limit(1);
    if (!row || row.enabledAt) return null;
    const secret = decryptTotpSecret(row.encryptedSecret);
    const counter = matchingTotpCounter(secret, code);
    if (!isTotpCounterFresh(counter, row.lastAcceptedCounter)) return null;
    const now = new Date();
    const updated = await tx.update(userTotp).set({ enabledAt: now, verifiedAt: now, lastAcceptedCounter: counter, updatedAt: now })
      .where(and(eq(userTotp.userId, userId), isNull(userTotp.enabledAt), sql`(${userTotp.lastAcceptedCounter} IS NULL OR ${userTotp.lastAcceptedCounter} < ${counter})`))
      .returning({ userId: userTotp.userId });
    if (!updated.length) return null;
    const codes = createRecoveryCodes(10);
    await tx.delete(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, userId));
    await tx.insert(totpRecoveryCodes).values(codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code, getAuthSecret()) })));
    return codes;
  });
}

async function consumeProof(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: string, proof: string): Promise<boolean> {
  const [totp] = await tx.select().from(userTotp).where(eq(userTotp.userId, userId)).for("update").limit(1);
  if (!totp?.enabledAt || !totp.verifiedAt) return false;
  const secret = decryptTotpSecret(totp.encryptedSecret);
  const counter = matchingTotpCounter(secret, proof);
  if (isTotpCounterFresh(counter, totp.lastAcceptedCounter)) {
    const updated = await tx.update(userTotp).set({ lastAcceptedCounter: counter, updatedAt: new Date() })
      .where(and(eq(userTotp.userId, userId), sql`(${userTotp.lastAcceptedCounter} IS NULL OR ${userTotp.lastAcceptedCounter} < ${counter})`))
      .returning({ userId: userTotp.userId });
    if (updated.length) return true;
  }
  let digest: string;
  try { digest = hashRecoveryCode(proof, getAuthSecret()); } catch { return false; }
  const [recovery] = await tx.select({ id: totpRecoveryCodes.id }).from(totpRecoveryCodes)
    .where(and(eq(totpRecoveryCodes.userId, userId), eq(totpRecoveryCodes.codeHash, digest), isNull(totpRecoveryCodes.usedAt)))
    .for("update").limit(1);
  if (!recovery) return false;
  const consumed = await tx.update(totpRecoveryCodes).set({ usedAt: new Date() })
    .where(and(eq(totpRecoveryCodes.id, recovery.id), isNull(totpRecoveryCodes.usedAt))).returning({ id: totpRecoveryCodes.id });
  return consumed.length === 1;
}

export async function disableTotp(
  userId: string,
  proof: string | undefined,
  passwordConfirmed: boolean,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    if (!passwordConfirmed && (!proof || !(await consumeProof(tx, userId, proof)))) return false;
    await tx.delete(userTotp).where(eq(userTotp.userId, userId));
    await tx.delete(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, userId));
    await tx.delete(pendingTwoFactorChallenges).where(eq(pendingTwoFactorChallenges.userId, userId));
    return true;
  });
}

export async function regenerateRecoveryCodes(
  userId: string,
  proof: string | undefined,
  passwordConfirmed: boolean,
): Promise<string[] | null> {
  return db.transaction(async (tx) => {
    if (!passwordConfirmed && (!proof || !(await consumeProof(tx, userId, proof)))) return null;
    await tx.delete(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, userId));
    const codes = createRecoveryCodes(10);
    await tx.insert(totpRecoveryCodes).values(codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code, getAuthSecret()) })));
    return codes;
  });
}

export async function verifyPendingTwoFactor(proof: string): Promise<{ userId: string; returnTo: string; authMethod: "email" | "google" } | null> {
  const store = await cookies();
  const rawToken = store.get(TWO_FACTOR_COOKIE)?.value;
  if (!rawToken || !/^[A-Za-z0-9_-]{43}$/.test(rawToken)) return null;
  const tokenHash = hashOpaqueToken(rawToken);
  const sessionToken = createOpaqueSessionToken();
  const previousSessionToken = store.get("evora_account_session")?.value;
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [challenge] = await tx.select().from(pendingTwoFactorChallenges).where(eq(pendingTwoFactorChallenges.tokenHash, tokenHash)).for("update").limit(1);
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= now || challenge.attempts >= 5) return null;
    if (!(await consumeProof(tx, challenge.userId, proof))) {
      const attempts = challenge.attempts + 1;
      await tx.update(pendingTwoFactorChallenges).set({ attempts, ...(attempts >= 5 ? { consumedAt: now } : {}) }).where(eq(pendingTwoFactorChallenges.id, challenge.id));
      return null;
    }
    const consumed = await tx.update(pendingTwoFactorChallenges).set({ consumedAt: now })
      .where(and(eq(pendingTwoFactorChallenges.id, challenge.id), isNull(pendingTwoFactorChallenges.consumedAt), gt(pendingTwoFactorChallenges.expiresAt, now)))
      .returning({ id: pendingTwoFactorChallenges.id });
    if (consumed.length !== 1) return null;
    if (isOpaqueToken(previousSessionToken)) await tx.delete(accountSessions).where(eq(accountSessions.tokenHash, hashOpaqueToken(previousSessionToken)));
    await tx.delete(accountSessions).where(and(eq(accountSessions.userId, challenge.userId), lt(accountSessions.expiresAt, now)));
    await tx.insert(accountSessions).values({ userId: challenge.userId, tokenHash: hashOpaqueToken(sessionToken), expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000) });
    return { userId: challenge.userId, returnTo: challenge.returnTo, authMethod: challenge.authMethod as "email" | "google" };
  });
  if (!result) return null;
  store.set("evora_account_session", sessionToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS });
  store.set(TWO_FACTOR_COOKIE, "", pendingCookieOptions(0));
  return result;
}
