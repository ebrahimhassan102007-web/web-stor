/** Derive a rate-limit identity without trusting client-controlled proxy headers by default. */
export function getClientKey(req: Request, trustedProxyEnabled: boolean): string {
  if (!trustedProxyEnabled) return "untrusted-proxy";
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length <= 64 ? first : "unknown-client";
}
