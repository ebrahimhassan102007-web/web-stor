/**
 * Origin validation helpers (dependency-free so they are unit testable).
 *
 * Deployment expectations:
 *  - production must configure `APP_ORIGIN` to the exact public origin
 *    (`https://store.example.com`); without it state-changing requests are
 *    rejected (fail closed) instead of trusting whatever host/forwarded
 *    headers the request happens to carry;
 *  - in development the request's own `Host` header is used, never
 *    `X-Forwarded-Host`, which a client can freely spoof.
 */

export type OriginEnv = {
  readonly APP_ORIGIN?: string | undefined;
  readonly NODE_ENV?: string | undefined;
};

export function configuredOrigin(
  env: OriginEnv = process.env,
): string | null {
  const raw = env.APP_ORIGIN?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    // Reject credentials, paths, queries and fragments: APP_ORIGIN must be a
    // bare origin so comparisons cannot be widened by extra URL parts.
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "/") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** True only when `origin` is a well-formed origin equal to `expected`. */
export function isAllowedOrigin(
  origin: string | null,
  expected: string | null,
): boolean {
  if (!origin || !expected) return false;
  try {
    return new URL(origin).origin === expected;
  } catch {
    return false;
  }
}
