import "server-only";
import { NextResponse } from "next/server";

/**
 * Uniform, information-safe API responses.
 *
 * - Internal errors are logged server-side only; clients always receive a
 *   generic message — never database errors, stack traces or internals.
 * - Every API response is marked `Cache-Control: no-store` so per-user data
 *   (cart, session, orders) can never land in a shared cache.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(
    { ok: true as const, data },
    { ...init, headers: { ...NO_STORE, ...(init?.headers ?? {}) } },
  );
}

export function jsonError(
  message: string,
  status: number,
  details?: Record<string, string[]>,
  headers?: Record<string, string>,
) {
  return NextResponse.json(
    { ok: false as const, error: message, ...(details ? { details } : {}) },
    { status, headers: { ...NO_STORE, ...(headers ?? {}) } },
  );
}

export function rateLimitedResponse(retryAfterSeconds = 60) {
  return jsonError("Too many requests. Please slow down.", 429, undefined, {
    "Retry-After": String(retryAfterSeconds),
  });
}

export function handleUnexpected(context: string, err: unknown) {
  // Full detail stays on the server.
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      event: "api.unexpected",
      context,
      message: err instanceof Error ? err.message : String(err),
    }),
  );
  return jsonError("Something went wrong. Please try again.", 500);
}

/**
 * Reads and parses a JSON body with a hard size cap (default 32 KB).
 * Returns `undefined` when the body is missing, oversized or malformed.
 */
const MAX_BODY_BYTES = 32 * 1024;

export async function readJsonBody(
  req: Request,
  maxBytes: number = MAX_BODY_BYTES,
): Promise<unknown | undefined> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) return undefined;

  try {
    const text = await req.text();
    if (text.length > maxBytes) return undefined;
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
