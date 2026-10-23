import "server-only";
import { and, eq } from "drizzle-orm";
import { db, emailVerificationCodes, users } from "@/lib/db";
import type { Locale } from "@/lib/i18n/dictionary";
import { createVerificationCode, hashVerificationCode, verifyVerificationCode } from "@/lib/security/auth-core";
import { sendVerificationEmail } from "@/lib/security/email";

export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
export const EMAIL_RESEND_COOLDOWN_MS = 60 * 1000;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

export type VerificationIssue = "sent" | "cooldown" | "not-pending";

/**
 * Reserve a fresh code while holding the user's row lock so simultaneous
 * registration/login/resend requests cannot bypass the persistent cooldown.
 * Only an HMAC digest is stored; delivery is performed by the configured SMTP
 * provider, never by a development-only code display or log statement.
 */
export async function issueEmailVerification(
  userId: string,
  locale: Locale,
): Promise<VerificationIssue> {
  const code = createVerificationCode();
  const codeHash = hashVerificationCode(userId, code);
  const now = new Date();

  const reservation = await db.transaction(async (tx) => {
    const [user] = await tx
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .for("update")
      .limit(1);

    if (!user || user.emailVerifiedAt) return { status: "not-pending" as const };

    const [existing] = await tx
      .select()
      .from(emailVerificationCodes)
      .where(eq(emailVerificationCodes.userId, userId))
      .for("update")
      .limit(1);

    if (
      existing &&
      now.getTime() - existing.sentAt.getTime() < EMAIL_RESEND_COOLDOWN_MS
    ) {
      return { status: "cooldown" as const };
    }

    const values = {
      codeHash,
      expiresAt: new Date(now.getTime() + EMAIL_CODE_TTL_MS),
      sentAt: now,
      consumedAt: null,
      attempts: 0,
    };

    if (existing) {
      await tx
        .update(emailVerificationCodes)
        .set(values)
        .where(eq(emailVerificationCodes.userId, userId));
    } else {
      await tx.insert(emailVerificationCodes).values({ userId, ...values });
    }

    return {
      status: "reserved" as const,
      email: user.email,
      displayName: user.displayName,
    };
  });

  if (reservation.status === "cooldown") return "cooldown";
  if (reservation.status === "not-pending") return "not-pending";

  try {
    await sendVerificationEmail({
      to: reservation.email,
      displayName: reservation.displayName,
      code,
      locale,
    });
  } catch (error) {
    // Never leave a code valid when provider delivery failed. Match the exact
    // digest so a future code cannot be invalidated by this cleanup.
    await db
      .update(emailVerificationCodes)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(emailVerificationCodes.userId, userId),
          eq(emailVerificationCodes.codeHash, codeHash),
        ),
      )
      .catch(() => {});
    throw error;
  }

  return "sent";
}

export type VerificationResult =
  | { status: "verified"; userId: string }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "locked" };

/** Lock, validate, consume and verify atomically; a code can only succeed once. */
export async function consumeEmailVerification(
  email: string,
  code: string,
): Promise<VerificationResult> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!user || user.emailVerifiedAt) return { status: "invalid" };

    const [record] = await tx
      .select()
      .from(emailVerificationCodes)
      .where(eq(emailVerificationCodes.userId, user.id))
      .for("update")
      .limit(1);
    if (!record || record.consumedAt) return { status: "invalid" };

    const now = new Date();
    if (record.expiresAt.getTime() <= now.getTime()) {
      await tx
        .update(emailVerificationCodes)
        .set({ consumedAt: now })
        .where(eq(emailVerificationCodes.userId, user.id));
      return { status: "expired" };
    }

    if (record.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
      await tx
        .update(emailVerificationCodes)
        .set({ consumedAt: now })
        .where(eq(emailVerificationCodes.userId, user.id));
      return { status: "locked" };
    }

    if (!verifyVerificationCode(user.id, code, record.codeHash)) {
      const attempts = record.attempts + 1;
      await tx
        .update(emailVerificationCodes)
        .set({
          attempts,
          ...(attempts >= EMAIL_CODE_MAX_ATTEMPTS ? { consumedAt: now } : {}),
        })
        .where(eq(emailVerificationCodes.userId, user.id));
      return attempts >= EMAIL_CODE_MAX_ATTEMPTS
        ? { status: "locked" }
        : { status: "invalid" };
    }

    await tx
      .update(emailVerificationCodes)
      .set({ consumedAt: now })
      .where(eq(emailVerificationCodes.userId, user.id));
    await tx
      .update(users)
      .set({ emailVerifiedAt: now, updatedAt: now })
      .where(eq(users.id, user.id));

    return { status: "verified", userId: user.id };
  });
}
