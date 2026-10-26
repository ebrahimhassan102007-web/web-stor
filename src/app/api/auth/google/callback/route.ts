import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db, accountSessions, emailVerificationCodes, googleOAuthStates, users } from "@/lib/db";
import { planGoogleLink } from "@/lib/security/google-link";
import { createAccountSession } from "@/lib/security/account-session";
import { enforceAuthRateLimit, isAuthSecretConfigured } from "@/lib/security/auth-rate-limit";
import { safeReturnPath, secureStringEqual } from "@/lib/security/auth-core";
import {
  exchangeGoogleCode,
  getAppOrigin,
  getGoogleClientId,
  getGoogleClientSecret,
  googleOAuthConfigured,
  GOOGLE_CALLBACK_PATH,
  GOOGLE_STATE_COOKIE,
  oauthStateHash,
} from "@/lib/security/google-oauth";

export const dynamic = "force-dynamic";

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: GOOGLE_CALLBACK_PATH,
    maxAge,
  };
}

async function loginError(request: NextRequest, error: string) {
  const store = await cookies();
  store.set(GOOGLE_STATE_COOKIE, "", cookieOptions(0));
  const origin = getAppOrigin(request.nextUrl.origin, request.headers);
  if (!origin) {
    return NextResponse.json(
      { ok: false, error: "AUTH_NOT_CONFIGURED" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const url = new URL("/login", origin);
  url.searchParams.set("authError", error);
  return NextResponse.redirect(url, { status: 303 });
}

async function consumeState(state: string) {
  const stateHash = oauthStateHash(state);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(googleOAuthStates)
      .where(eq(googleOAuthStates.stateHash, stateHash))
      .for("update")
      .limit(1);
    if (!row) return null;

    await tx
      .delete(googleOAuthStates)
      .where(eq(googleOAuthStates.stateHash, stateHash));
    if (row.expiresAt.getTime() <= Date.now()) return null;
    return row;
  });
}

type LinkCandidate = {
  id: string;
  googleSub: string | null;
  displayName: string;
  emailVerifiedAt: Date | null;
  passwordHash: string | null;
};

async function applyGoogleLink(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  candidate: LinkCandidate,
  input: { subject: string; displayName: string },
  now: Date,
): Promise<string> {
  const plan = planGoogleLink(
    {
      googleSub: candidate.googleSub,
      emailVerifiedAt: candidate.emailVerifiedAt,
      hasPasswordHash: Boolean(candidate.passwordHash),
    },
    input.subject,
  );
  if (plan.action === "reject") {
    throw new Error("Google account is already linked to a different identity");
  }
  // S-01: when Google proves ownership of an email whose password account
  // was never verified, the pre-registered password (possibly an attacker's)
  // must not survive. Pending codes and all sessions are revoked in the
  // same transaction.
  if (plan.deleteVerificationCodes) {
    await tx
      .delete(emailVerificationCodes)
      .where(eq(emailVerificationCodes.userId, candidate.id));
  }
  if (plan.revokeAllSessions) {
    await tx.delete(accountSessions).where(eq(accountSessions.userId, candidate.id));
  }
  const [updated] = await tx
    .update(users)
    .set({
      googleSub: input.subject,
      emailVerifiedAt: candidate.emailVerifiedAt ?? now,
      displayName: candidate.displayName || input.displayName,
      ...(plan.clearPasswordHash ? { passwordHash: null } : {}),
      updatedAt: now,
    })
    .where(eq(users.id, candidate.id))
    .returning({ id: users.id });
  if (!updated) throw new Error("Google account update failed");
  return updated.id;
}

const linkColumns = {
  id: users.id,
  googleSub: users.googleSub,
  displayName: users.displayName,
  emailVerifiedAt: users.emailVerifiedAt,
  passwordHash: users.passwordHash,
};

async function findOrCreateGoogleUser(input: {
  subject: string;
  email: string;
  displayName: string;
}): Promise<string> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [existing] = await tx
      .select(linkColumns)
      .from(users)
      .where(eq(users.email, input.email))
      .for("update")
      .limit(1);

    if (existing) return applyGoogleLink(tx, existing, input, now);

    const [created] = await tx
      .insert(users)
      .values({
        email: input.email,
        displayName: input.displayName,
        googleSub: input.subject,
        emailVerifiedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: users.id });
    if (created) return created.id;

    // A concurrent callback may have inserted the same email first. Apply
    // the exact same S-01 linking policy to the raced row.
    const [raced] = await tx
      .select(linkColumns)
      .from(users)
      .where(eq(users.email, input.email))
      .for("update")
      .limit(1);
    if (!raced) throw new Error("Google account could not be linked");
    return applyGoogleLink(tx, raced, input, now);
  });
}

export async function GET(request: NextRequest) {
  const returnedState = request.nextUrl.searchParams.get("state") ?? "";
  const store = await cookies();
  const cookieState = store.get(GOOGLE_STATE_COOKIE)?.value ?? "";

  if (
    returnedState.length !== 43 ||
    cookieState.length !== 43 ||
    !secureStringEqual(returnedState, cookieState)
  ) {
    return loginError(request, "google_failed");
  }

  try {
    if (!isAuthSecretConfigured()) {
      return loginError(request, "auth_config");
    }
    if (
      !(await enforceAuthRateLimit(request, "google-callback", undefined, {
        windowMs: 10 * 60 * 1000,
        ipLimit: 40,
      }))
    ) {
      return loginError(request, "rate_limited");
    }

    const state = await consumeState(returnedState);
    store.set(GOOGLE_STATE_COOKIE, "", cookieOptions(0));
    if (!state) return loginError(request, "google_failed");

    if (request.nextUrl.searchParams.has("error")) {
      return loginError(request, "google_cancelled");
    }
    const code = request.nextUrl.searchParams.get("code");
    const origin = getAppOrigin(request.nextUrl.origin, request.headers);
    const clientId = getGoogleClientId();
    const clientSecret = getGoogleClientSecret();
    if (!code || code.length > 2_048 || !origin || !clientId || !clientSecret || !googleOAuthConfigured()) {
      return loginError(request, "google_config");
    }

    const identity = await exchangeGoogleCode({
      code,
      codeVerifier: state.codeVerifier,
      nonce: state.nonce,
      redirectUri: new URL(GOOGLE_CALLBACK_PATH, origin).toString(),
      clientId,
      clientSecret,
    });

    const userId = await findOrCreateGoogleUser(identity);
    await createAccountSession(userId);
    const returnTo = safeReturnPath(state.returnTo);
    return NextResponse.redirect(new URL(returnTo, origin), { status: 303 });
  } catch (error) {
    console.error(
      "[auth:google:callback] sign-in could not be completed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return loginError(request, "google_unavailable");
  }
}
