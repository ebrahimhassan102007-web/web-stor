import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, users } from "@/lib/db";
import { makeAccountSessionCookie } from "@/lib/security/account-session";
import { configuredOrigin } from "@/lib/security/origin";

export const dynamic = "force-dynamic";
const STATE_COOKIE = "webstor_oauth_state";
const VERIFIER_COOKIE = "webstor_oauth_verifier";
const googleUserSchema = z.object({
  sub: z.string().min(1).max(256),
  email: z.string().trim().toLowerCase().email().max(254),
  email_verified: z.boolean(),
  name: z.string().trim().min(1).max(128),
  picture: z.string().url().max(2048).optional(),
});
function matchesState(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}
function clearOAuthCookies(response: NextResponse, secure: boolean) {
  const options = { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: 0 };
  response.cookies.set(STATE_COOKIE, "", options);
  response.cookies.set(VERIFIER_COOKIE, "", options);
}
function fail(origin: string, code: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", code);
  const response = NextResponse.redirect(url);
  clearOAuthCookies(response, origin.startsWith("https://"));
  return response;
}
export async function GET(request: NextRequest) {
  const origin = configuredOrigin();
  if (!origin) return NextResponse.json({ ok: false, error: "Sign-in origin is not configured." }, { status: 503 });
  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value ?? "";
  const verifier = store.get(VERIFIER_COOKIE)?.value ?? "";
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const code = request.nextUrl.searchParams.get("code") ?? "";
  if (request.nextUrl.searchParams.has("error")) return fail(origin, "google_failed");
  if (!code || !state || !expected || !verifier || !matchesState(state, expected)) {
    return fail(origin, "oauth_state");
  }
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return fail(origin, "google_not_configured");

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      cache: "no-store",
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret, code, code_verifier: verifier,
        grant_type: "authorization_code", redirect_uri: origin + "/api/auth/google/callback",
      }),
    });
    if (!tokenResponse.ok) return fail(origin, "google_failed");
    const tokenData = await tokenResponse.json().catch(() => null) as { access_token?: unknown } | null;
    if (!tokenData || typeof tokenData.access_token !== "string") return fail(origin, "google_failed");

    const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: "Bearer " + tokenData.access_token },
      cache: "no-store",
    });
    if (!userResponse.ok) return fail(origin, "google_failed");
    const parsed = googleUserSchema.safeParse(await userResponse.json().catch(() => null));
    if (!parsed.success || parsed.data.email_verified !== true) return fail(origin, "google_failed");
    const profile = parsed.data;

    const [existing] = await db.select({ id: users.id }).from(users)
      .where(eq(users.googleSub, profile.sub)).limit(1);
    let userId: string;
    if (existing) {
      await db.update(users).set({
        email: profile.email, avatarUrl: profile.picture ?? "", updatedAt: new Date(),
      }).where(eq(users.id, existing.id));
      userId = existing.id;
    } else {
      // Never silently link accounts by email: only the verified Google subject identifies an account.
      const [created] = await db.insert(users).values({
        googleSub: profile.sub, email: profile.email, name: profile.name,
        avatarUrl: profile.picture ?? "",
      }).returning({ id: users.id });
      if (!created) return fail(origin, "google_failed");
      userId = created.id;
    }
    const session = makeAccountSessionCookie(userId);
    const response = NextResponse.redirect(new URL("/account", origin));
    response.cookies.set(session.name, session.value, session.options);
    clearOAuthCookies(response, origin.startsWith("https://"));
    return response;
  } catch {
    return fail(origin, "google_failed");
  }
}
