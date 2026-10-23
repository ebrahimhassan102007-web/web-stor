import "server-only";
import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { authEmailSchema } from "@/lib/security/auth-validation";
import { secureStringEqual } from "@/lib/security/auth-core";

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
  { timeoutDuration: 5_000, cacheMaxAge: 10 * 60 * 1000 },
);

export const GOOGLE_STATE_COOKIE = "evora_google_oauth_state";
export const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";
export const GOOGLE_STATE_TTL_SECONDS = 10 * 60;

export function googleOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

export function getGoogleClientId(): string | null {
  return process.env.GOOGLE_CLIENT_ID?.trim() || null;
}

export function getGoogleClientSecret(): string | null {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() || null;
}

function parseOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/** Never derive production OAuth callback origins from forwarded Host headers. */
export function getAppOrigin(
  requestOrigin: string,
  requestHeaders?: Headers,
): string | null {
  if (process.env.NODE_ENV === "production") {
    return parseOrigin(process.env.APP_ORIGIN);
  }

  const forwardedHost = requestHeaders?.get("x-forwarded-host");
  const host = forwardedHost ?? requestHeaders?.get("host");
  const forwardedProtocol = requestHeaders?.get("x-forwarded-proto");
  if (host && !host.includes(",") && host.trim() === host) {
    const protocol = forwardedProtocol
      ? forwardedProtocol.split(",")[0].trim()
      : new URL(requestOrigin).protocol.slice(0, -1);
    if (protocol === "http" || protocol === "https") {
      return parseOrigin(`${protocol}://${host}`);
    }
  }
  return parseOrigin(process.env.APP_ORIGIN) ?? parseOrigin(requestOrigin);
}

export function googleAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}): URL {
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url;
}

export async function exchangeGoogleCode(input: {
  code: string;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ subject: string; email: string; displayName: string }> {
  const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
      code_verifier: input.codeVerifier,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenResponse.ok) throw new Error("Google token exchange failed");

  const tokenBody: unknown = await tokenResponse.json();
  if (
    !tokenBody ||
    typeof tokenBody !== "object" ||
    !("id_token" in tokenBody) ||
    typeof tokenBody.id_token !== "string" ||
    tokenBody.id_token.length > 16_384
  ) {
    throw new Error("Google returned an invalid identity token");
  }

  const { payload } = await jwtVerify(tokenBody.id_token, GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: input.clientId,
    algorithms: ["RS256"],
  });

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    typeof payload.nonce !== "string" ||
    !secureStringEqual(payload.nonce, input.nonce) ||
    typeof payload.sub !== "string" ||
    payload.sub.length < 1 ||
    payload.sub.length > 255 ||
    typeof payload.email !== "string" ||
    payload.email_verified !== true ||
    typeof payload.iat !== "number" ||
    payload.iat > nowSeconds + 60 ||
    payload.iat < nowSeconds - 3_600 ||
    typeof payload.exp !== "number" ||
    payload.exp <= nowSeconds ||
    payload.exp - payload.iat > 3_660
  ) {
    throw new Error("Google identity claims were not accepted");
  }

  if (
    (payload.azp !== undefined && payload.azp !== input.clientId) ||
    (Array.isArray(payload.aud) &&
      payload.aud.length > 1 &&
      payload.azp !== input.clientId)
  ) {
    throw new Error("Google authorized party mismatch");
  }

  const parsedEmail = authEmailSchema.safeParse(payload.email);
  if (!parsedEmail.success) throw new Error("Google email claim was invalid");

  const rawName = typeof payload.name === "string" ? payload.name : "";
  const displayName = rawName
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 128) || parsedEmail.data.split("@")[0].slice(0, 128);

  return {
    subject: payload.sub,
    email: parsedEmail.data,
    displayName,
  };
}

export function oauthStateHash(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}
