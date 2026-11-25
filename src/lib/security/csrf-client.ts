"use client";

import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/security/csrf-constants";

function readCsrfCookie(): string | null {
  const prefix = `${CSRF_COOKIE}=`;
  const value = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : null;
}

let pendingToken: Promise<string> | null = null;

async function getCsrfToken(): Promise<string> {
  const existing = readCsrfCookie();
  if (existing) return existing;
  pendingToken ??= fetch("/api/auth/csrf", { cache: "no-store", credentials: "same-origin" })
    .then(async (response) => {
      if (!response.ok) throw new Error("CSRF token unavailable");
      const body = await response.json() as { token?: unknown };
      if (typeof body.token !== "string" || !readCsrfCookie()) throw new Error("CSRF token unavailable");
      return body.token;
    })
    .finally(() => { pendingToken = null; });
  return pendingToken;
}

/** Fetch wrapper for state-changing same-origin JSON/form API calls. */
export async function csrfFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return fetch(input, { ...init, credentials: init.credentials ?? "same-origin" });
  }
  const token = await getCsrfToken();
  const headers = new Headers(init.headers);
  headers.set(CSRF_HEADER, token);
  return fetch(input, { ...init, method, headers, credentials: init.credentials ?? "same-origin" });
}
