import "server-only";
import { NextResponse } from "next/server";
import { safeErrorForLog } from "@/lib/log-safety";

export { safeErrorForLog, type LogSafeError } from "@/lib/log-safety";

/**
 * Uniform, information-safe API responses.
 *
 * Internal errors are logged server-side only; clients always receive a
 * generic message — never database errors, stack traces or internals.
 */

export function jsonOk<T>(data: T, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
  headers.append("Vary", "Cookie");
  return NextResponse.json({ ok: true as const, data }, { ...init, headers });
}

export function jsonError(
  message: string,
  status: number,
  details?: Record<string, string[]>,
) {
  return NextResponse.json(
    { ok: false as const, error: message, ...(details ? { details } : {}) },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
        Vary: "Cookie",
      },
    },
  );
}

export function handleUnexpected(context: string, err: unknown) {
  // Only a name/code fingerprint stays on the server; never messages, SQL or
  // bound parameters (they can contain account data).
  console.error(`[api:${context}]`, safeErrorForLog(err));
  return jsonError("Something went wrong. Please try again.", 500);
}
