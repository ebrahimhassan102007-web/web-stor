import { createHmac } from "node:crypto";
import { getAuthSecret } from "./auth-core";
import { clientFingerprint, trustedClientIp } from "./client-ip";
import type { ActorKind } from "./threat-policy";

/**
 * Threat actor identity (S-25).
 *
 * Deliberately narrow, because a ban is only as safe as the identity behind it:
 *
 *  - a **trusted** client IP (`TRUST_PROXY_IP_HEADERS=true`), or
 *  - a salted fingerprint of distinguishing request headers, and only when the
 *    request actually carried some, or
 *  - nothing at all — in which case no ban is created. An unattributable
 *    request must never be able to ban a shared bucket of other visitors.
 *
 * Keys are HMACed with `AUTH_SECRET`, so no raw address, cookie or header is
 * ever persisted. Rotating the secret invalidates stored keys, which is the
 * intended behaviour: bans are operational data, not identity.
 *
 * This module carries no `server-only` marker and no database import so the
 * local owner CLI can derive the same keys it stores.
 */
export type ThreatActor = {
  kind: ActorKind;
  /** Ban key. `null` means "not attributable" and therefore never bannable. */
  key: string | null;
  /** Raw trusted IP, for diagnostics only (never persisted). */
  ip: string | null;
};

/**
 * Headers excluded from the ban fingerprint: they are either per-request
 * (method-dependent), session-bearing, or proxy-injected, so including them
 * would make an actor's key unstable and its escalation meaningless.
 */
const FINGERPRINT_EXCLUDED = new Set([
  "cookie", "host", "content-length", "content-type", "origin", "referer",
  "accept", "cache-control", "pragma", "range", "if-none-match",
  "if-modified-since", "x-forwarded-for", "x-forwarded-host",
  "x-forwarded-proto", "x-real-ip", "x-request-id", "x-nonce",
  "next-router-prefetch", "purpose", "connection",
  "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest", "sec-fetch-user",
]);

/**
 * A stable, discriminating description of the client's header set.
 *
 * All non-volatile headers are included (sorted), so a bot's minimal or
 * library-specific header set never collides with a real browser's — while the
 * excluded set keeps the value identical across one client's requests.
 */
export function fingerprintSource(headers: Headers): string {
  const entries: string[] = [];
  headers.forEach((value, name) => {
    const key = name.toLowerCase();
    if (FINGERPRINT_EXCLUDED.has(key)) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    entries.push(`${key}=${trimmed}`);
  });
  entries.sort();
  return entries.join("\0");
}

function actorDigest(kind: "ip" | "fingerprint", value: string): string {
  return createHmac("sha256", getAuthSecret())
    .update(`evora-threat-actor\0${kind}\0${value}`)
    .digest("hex")
    .slice(0, 64);
}

/** Ban key for an explicitly supplied IP (owner CLI). */
export function banKeyForIp(ip: string): string {
  return `ip:${actorDigest("ip", ip)}`;
}

/** Ban key for an explicitly supplied header fingerprint source. */
export function banKeyForFingerprint(source: string): string {
  return `fp:${actorDigest("fingerprint", source)}`;
}

/** The coarse (unsalted) fingerprint, for operator diagnostics. */
export function diagnosticFingerprint(request: Request): string {
  return clientFingerprint(request.headers);
}

export function resolveThreatActor(
  request: Request,
  options?: { trustProxyHeaders?: boolean },
): ThreatActor {
  const trustProxyHeaders =
    options?.trustProxyHeaders ?? process.env.TRUST_PROXY_IP_HEADERS === "true";
  const ip = trustedClientIp(request, trustProxyHeaders);
  if (ip) return { kind: "ip", key: banKeyForIp(ip), ip };

  const source = fingerprintSource(request.headers);

  // A request with no distinguishing header at all is not attributable to
  // anything, so it is logged but never banned.
  if (source === "") {
    return { kind: "unknown", key: null, ip: null };
  }

  return { kind: "fingerprint", key: banKeyForFingerprint(source), ip: null };
}
