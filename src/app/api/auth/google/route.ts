import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { configuredOrigin } from "@/lib/security/origin";

export const dynamic = "force-dynamic";
const STATE_COOKIE = "webstor_oauth_state";
const VERIFIER_COOKIE = "webstor_oauth_verifier";

export async function GET() {
  const origin = configuredOrigin();
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!origin || !clientId || !clientSecret) {
    return NextResponse.json(
      { ok: false, error: "Google sign-in is not configured for this deployment." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", origin + "/api/auth/google/callback");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(authUrl);
  const options = {
    httpOnly: true, secure: origin.startsWith("https://"),
    sameSite: "lax" as const, path: "/", maxAge: 600,
  };
  response.cookies.set(STATE_COOKIE, state, options);
  response.cookies.set(VERIFIER_COOKIE, verifier, options);
  return response;
}
