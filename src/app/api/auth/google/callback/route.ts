import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db, googleOAuthStates, users } from "@/lib/db";
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

async function findOrCreateGoogleUser(input: {
  subject: string;
  email: string;
  displayName: string;
}): Promise<string> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [existing] = await tx
      .select({
        id: users.id,
        googleSub: users.googleSub,
        displayName: users.displayName,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.email, input.email))
      .for("update")
      .limit(1);

    if (existing) {
      if (existing.googleSub && existing.googleSub !== input.subject) {
        throw new Error("Google account is already linked to a different identity");
      }
      const [updated] = await tx
        .update(users)
        .set({
          googleSub: input.subject,
          emailVerifiedAt: existing.emailVerifiedAt ?? now,
          displayName: existing.displayName || input.displayName,
          updatedAt: now,
        })
        .where(eq(users.id, existing.id))
        .returning({ id: users.id });
      if (!updated) throw new Error("Google account update failed");
      return updated.id;
    }

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

    // A concurrent callback may have inserted the same email first. Link only
    // if the existing Google subject is absent or matches this verified sub.
    const [raced] = await tx
      .select({
        id: users.id,
        googleSub: users.googleSub,
        displayName: users.displayName,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.email, input.email))
      .for("update")
      .limit(1);
    if (!raced || (raced.googleSub && raced.googleSub !== input.subject)) {
      throw new Error("Google account could not be linked");
    }

    const [updated] = await tx
      .update(users)
      .set({
        googleSub: input.subject,
        emailVerifiedAt: raced.emailVerifiedAt ?? now,
        displayName: raced.displayName || input.displayName,
        updatedAt: now,
      })
      .where(eq(users.id, raced.id))
      .returning({ id: users.id });
    if (!updated) throw new Error("Google account update failed");
    return updated.id;
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
