import "server-only";
import { NextResponse } from "next/server";

/**
 * Uniform, information-safe API responses.
 *
 * Internal errors are logged server-side only; clients always receive a
 * generic message — never database errors, stack traces or internals.
 */

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true as const, data }, init);
}

export function jsonError(
  message: string,
  status: number,
  details?: Record<string, string[]>,
) {
  return NextResponse.json(
    { ok: false as const, error: message, ...(details ? { details } : {}) },
    { status },
  );
}

export function handleUnexpected(context: string, err: unknown) {
  // Full detail stays on the server.
  console.error(`[api:${context}]`, err);
  return jsonError("Something went wrong. Please try again.", 500);
}
