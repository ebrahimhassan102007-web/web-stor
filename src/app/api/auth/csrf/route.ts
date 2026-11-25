import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthSecret } from "@/lib/security/auth-core";
import { createCsrfToken } from "@/lib/security/csrf-token";
import { CSRF_COOKIE } from "@/lib/security/csrf";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = createCsrfToken(getAuthSecret());
  const store = await cookies();
  store.set(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return NextResponse.json({ token }, {
    headers: {
      "Cache-Control": "private, no-store, no-cache, must-revalidate",
      Vary: "Cookie",
    },
  });
}
