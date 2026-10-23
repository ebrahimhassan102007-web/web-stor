import { createHash, randomBytes } from "node:crypto";
import { lt } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db, googleOAuthStates } from "@/lib/db";
import { safeReturnPath } from "@/lib/security/auth-core";
import { enforceAuthRateLimit, isAuthSecretConfigured } from "@/lib/security/auth-rate-limit";
import {
  getAppOrigin,
  getGoogleClientId,
  getGoogleClientSecret,
  googleAuthorizationUrl,
  googleOAuthConfigured,
  GOOGLE_CALLBACK_PATH,
  GOOGLE_STATE_COOKIE,
  GOOGLE_STATE_TTL_SECONDS,
  oauthStateHash,
} from "@/lib/security/google-oauth";

export const dynamic = "force-dynamic";

function loginError(request: NextRequest, error: string) {
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

export async function GET(request: NextRequest) {
  if (!isAuthSecretConfigured()) return loginError(request, "auth_config");
  if (!googleOAuthConfigured()) return loginError(request, "google_config");

  const origin = getAppOrigin(request.nextUrl.origin, request.headers);
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  if (!origin || !clientId || !clientSecret) {
    return loginError(request, "google_config");
  }

  try {
    if (
      !(await enforceAuthRateLimit(request, "google-start", undefined, {
        windowMs: 10 * 60 * 1000,
        ipLimit: 20,
      }))
    ) {
      return loginError(request, "rate_limited");
    }

    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    const expiresAt = new Date(Date.now() + GOOGLE_STATE_TTL_SECONDS * 1000);

    await db
      .delete(googleOAuthStates)
      .where(lt(googleOAuthStates.expiresAt, new Date()));
    await db.insert(googleOAuthStates).values({
      stateHash: oauthStateHash(state),
      nonce,
      codeVerifier,
      returnTo: safeReturnPath(request.nextUrl.searchParams.get("next")),
      expiresAt,
    });

    const store = await cookies();
    store.set(GOOGLE_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: GOOGLE_CALLBACK_PATH,
      maxAge: GOOGLE_STATE_TTL_SECONDS,
    });

    const authorizationUrl = googleAuthorizationUrl({
      clientId,
      redirectUri: new URL(GOOGLE_CALLBACK_PATH, origin).toString(),
      state,
      nonce,
      codeChallenge,
    });
    return NextResponse.redirect(authorizationUrl, { status: 302 });
  } catch {
    console.error("[auth:google:start] authorization could not be initialized");
    return loginError(request, "google_unavailable");
  }
}
