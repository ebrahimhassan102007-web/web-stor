import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, accountSessions, passwordResetTokens, users } from "@/lib/db";
import { hashPasswordResetToken } from "@/lib/security/auth-core";
import { sendPasswordResetEmail } from "@/lib/security/email";
import type { Locale } from "@/lib/i18n/dictionary";

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
export const hashResetToken = hashPasswordResetToken;

export async function issuePasswordReset(userId: string, email: string, displayName: string, locale: Locale): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(token);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(passwordResetTokens).values({ userId, tokenHash, expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS), consumedAt: null, createdAt: now })
      .onConflictDoUpdate({ target: passwordResetTokens.userId, set: { tokenHash, expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS), consumedAt: null, createdAt: now } });
  });
  await sendPasswordResetEmail({ to: email, displayName, token, locale });
}

export async function consumePasswordReset(token: string, nextPasswordHash: string): Promise<string | null> {
  const tokenHash = hashResetToken(token);
  const now = new Date();
  return db.transaction(async (tx) => {
    const [reset] = await tx.select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash)).for("update").limit(1);
    if (!reset || reset.consumedAt || reset.expiresAt <= now) return null;
    const [user] = await tx.update(users).set({ passwordHash: nextPasswordHash, updatedAt: now })
      .where(eq(users.id, reset.userId)).returning({ id: users.id });
    if (!user) return null;
    const marked = await tx.update(passwordResetTokens).set({ consumedAt: now })
      .where(and(eq(passwordResetTokens.id, reset.id), isNull(passwordResetTokens.consumedAt), gt(passwordResetTokens.expiresAt, now)))
      .returning({ id: passwordResetTokens.id });
    if (!marked.length) throw new Error("Reset token consumption race");
    await tx.delete(accountSessions).where(eq(accountSessions.userId, reset.userId));
    return reset.userId;
  });
}
