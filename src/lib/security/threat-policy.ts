/**
 * Threat-shield policy (S-25) — pure decision logic only.
 *
 * Everything in this module is deterministic and dependency-free so it can be
 * unit tested without a database, and so the same rules are shared by the
 * Next.js proxy (Node.js runtime), the API request guard and the owner CLI.
 *
 * Two tiers, deliberately different in how far they reach:
 *
 *  - **Tier 1 — certainty.** An unambiguous adversary signal (scanner path,
 *    filled honeypot, CSRF forgery, prototype-pollution payload, tampered
 *    OAuth/webhook state). Immediate ban: 24h → 7d → permanent, but *permanent
 *    only for a trusted client IP*. A header fingerprint is guessable and can
 *    collide between unrelated visitors, so it is capped at 24h and can never
 *    become permanent.
 *  - **Tier 2 — suspicion.** Repeated brute force against auth/2FA/reset/promo
 *    endpoints. Progressive cooldown 15m → 2h → 24h, never permanent, so a
 *    shared ISP/CGNAT address is never locked out for good after a handful of
 *    failed logins.
 *
 * A strike never shortens an existing ban: the effective expiry is the later
 * of the current one and the newly computed one.
 */

export type ThreatTier = 1 | 2;

export type ThreatSignal =
  | "scanner_path"
  | "honeypot"
  | "csrf_forgery"
  | "prototype_pollution"
  | "state_tampering"
  | "rate_limit_abuse";

export type ActorKind = "ip" | "fingerprint" | "unknown";

export const THREAT_SIGNAL_TIER: Readonly<Record<ThreatSignal, ThreatTier>> = {
  scanner_path: 1,
  honeypot: 1,
  csrf_forgery: 1,
  prototype_pollution: 1,
  state_tampering: 1,
  rate_limit_abuse: 2,
};

export function signalTier(signal: ThreatSignal): ThreatTier {
  return THREAT_SIGNAL_TIER[signal];
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Tier 1 escalation: 24h → 7d → permanent (IP actors only). */
export const TIER1_ESCALATION_MS = [DAY, 7 * DAY] as const;
/** Tier 2 cooldowns: 15m → 2h → 24h, never permanent. */
export const TIER2_COOLDOWN_LADDER_MS = [15 * MINUTE, 2 * HOUR, DAY] as const;
/** A fingerprint actor never holds a ban longer than this. */
export const FINGERPRINT_MAX_BAN_MS = DAY;
/** A strike only continues an escalation while the previous one is recent. */
export const STRIKE_WINDOW_MS: Readonly<Record<ThreatTier, number>> = {
  1: 7 * DAY,
  2: DAY,
};

export type BanSnapshot = {
  strikes: number;
  tier: ThreatTier;
  permanent: boolean;
  active: boolean;
  liftedAtMs: number | null;
  lastStrikeAtMs: number;
  expiresAtMs: number | null;
};

export type BanPlan = {
  strikes: number;
  tier: ThreatTier;
  signal: ThreatSignal;
  permanent: boolean;
  /** `null` exactly when the ban is permanent. */
  expiresAtMs: number | null;
  lastStrikeAtMs: number;
};

export type StrikeInput = {
  tier: ThreatTier;
  signal: ThreatSignal;
  actorKind: Exclude<ActorKind, "unknown">;
  nowMs: number;
};

function ladderFor(tier: ThreatTier, strikes: number): number {
  const ladder = tier === 1 ? TIER1_ESCALATION_MS : TIER2_COOLDOWN_LADDER_MS;
  const index = Math.min(Math.max(strikes, 1), ladder.length) - 1;
  return ladder[index];
}

/**
 * Compute the next ban row for an actor.
 *
 * `prev` is the stored row (or `null`). The returned plan never weakens an
 * existing ban: permanent stays permanent, and an active expiry is only ever
 * extended.
 */
export function planBanStrike(
  prev: BanSnapshot | null,
  strike: StrikeInput,
): BanPlan {
  const window = STRIKE_WINDOW_MS[strike.tier];
  const continuing =
    prev !== null &&
    prev.active &&
    prev.liftedAtMs === null &&
    strike.nowMs >= prev.lastStrikeAtMs &&
    strike.nowMs - prev.lastStrikeAtMs <= window;

  const strikes = Math.min(continuing ? prev.strikes + 1 : 1, 1_000);
  // A tier-1 history keeps the stricter ladder; a tier-2 strike can never
  // escalate an actor into a permanent ban.
  const tier: ThreatTier = continuing && prev.tier === 1 ? 1 : strike.tier;
  const signal = strike.signal;

  const permanentByLadder =
    tier === 1 && strikes >= TIER1_ESCALATION_MS.length + 1;

  // Only a trusted IP may ever be banned permanently. A fingerprint is a
  // coarse, spoofable header hash that unrelated visitors can share.
  const permanent =
    prev?.permanent === true ||
    (permanentByLadder && strike.actorKind === "ip");

  if (permanent) {
    return {
      strikes,
      tier,
      signal,
      permanent: true,
      expiresAtMs: null,
      lastStrikeAtMs: strike.nowMs,
    };
  }

  const candidate = strike.nowMs + ladderFor(tier, strikes);
  const previousExpiry =
    prev && !prev.permanent && prev.active && prev.expiresAtMs !== null
      ? prev.expiresAtMs
      : 0;
  const bounded =
    strike.actorKind === "fingerprint"
      ? Math.min(candidate, strike.nowMs + FINGERPRINT_MAX_BAN_MS)
      : candidate;

  return {
    strikes,
    tier,
    signal,
    permanent: false,
    expiresAtMs: Math.max(bounded, previousExpiry, strike.nowMs + 1),
    lastStrikeAtMs: strike.nowMs,
  };
}

/**
 * How many fingerprint strikes are needed before a fingerprint ban is enforced.
 * A header fingerprint is shared by every visitor sending the same headers, so
 * acting on the first hit would block bystanders.
 */
export const FINGERPRINT_ENFORCE_MIN_STRIKES = 3;

/**
 * Whether a browser-like request looks like an ordinary visitor.
 *
 * Modern browsers always send Fetch metadata plus a client hint and a
 * language; a request that looks exactly like a normal browser is never
 * hard-blocked on a header fingerprint alone (see `shouldEnforceBan`).
 */
export function looksLikeOrdinaryBrowser(headers: {
  get(name: string): string | null;
}): boolean {
  const secFetchMode = headers.get("sec-fetch-mode");
  const clientHint = headers.get("sec-ch-ua");
  const language = headers.get("accept-language");
  const userAgent = headers.get("user-agent") ?? "";
  return (
    Boolean(secFetchMode && clientHint && language) &&
    /^Mozilla\/5\.0 /.test(userAgent)
  );
}

/**
 * Final enforcement decision for a stored ban.
 *
 *  - a trusted-IP ban is always enforced while it is active;
 *  - a fingerprint ban is only enforced after several strikes **and** never
 *    against a request that looks like an ordinary browser. Without a trusted
 *    IP there is no identity safe enough to hard-block on its own, so the
 *    fingerprint path warns and escalates but does not lock bystanders out.
 */
export function shouldEnforceBan(
  ban: {
    actorKind?: string;
    strikes: number;
    active: boolean;
    permanent: boolean;
    liftedAtMs: number | null;
    expiresAtMs: number | null;
  } | null,
  options: { requestLooksLikeBrowser: boolean; nowMs?: number },
): boolean {
  if (!ban || !banIsActive(ban, options.nowMs ?? Date.now())) return false;
  if (ban.actorKind !== "fingerprint") return true;
  if (ban.strikes < FINGERPRINT_ENFORCE_MIN_STRIKES) return false;
  return !options.requestLooksLikeBrowser;
}

/** An active, non-expired, non-lifted ban. */
export function banIsActive(
  ban: {
    active: boolean;
    permanent: boolean;
    liftedAtMs: number | null;
    expiresAtMs: number | null;
  } | null,
  nowMs: number = Date.now(),
): boolean {
  if (!ban || !ban.active || ban.liftedAtMs !== null) return false;
  if (ban.permanent) return true;
  return ban.expiresAtMs !== null && ban.expiresAtMs > nowMs;
}

/* ------------------------------------------------------------------ */
/* Request path classification                                         */
/* ------------------------------------------------------------------ */

/**
 * Exploit/scanner path families. These are never part of this application:
 * it has no WordPress, PHP, CGI, Git or Spring actuator surface at all, so any
 * request for one is a probe rather than a visitor.
 */
const SCANNER_PREFIXES: readonly string[] = [
  "/.env",
  "/.git",
  "/.svn",
  "/.hg",
  "/.aws",
  "/.ssh",
  "/.ds_store",
  "/wp-admin",
  "/wp-login.php",
  "/wp-content",
  "/wp-includes",
  "/xmlrpc.php",
  "/phpmyadmin",
  "/pma",
  "/myadmin",
  "/cgi-bin",
  "/actuator",
  "/server-status",
  "/vendor/phpunit",
];

/**
 * Normalize a request path for matching: percent-decode, drop dot segments and
 * duplicate slashes. Anything undecodable or absurdly long is left alone (the
 * router will 404 it); this never throws.
 */
export function normalizePathname(pathname: string): string {
  let value = pathname;
  if (value.length > 4096) value = value.slice(0, 4096);
  try {
    value = decodeURIComponent(value);
  } catch {
    // Keep the raw form; it can only ever fail to match.
  }
  const segments = value.split("/");
  const stack: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  return `/${stack.join("/")}`;
}

const ADMIN_SEGMENT = "admin";

/** True when the path is the (removed) web-admin surface. Never bannable. */
export function isAdminPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname).toLowerCase();
  const first = normalized.split("/")[1] ?? "";
  return first === ADMIN_SEGMENT;
}

/** The matching scanner family for a path, or `null` when it looks legit. */
export function matchScannerPath(pathname: string): string | null {
  const normalized = normalizePathname(pathname).toLowerCase();
  for (const prefix of SCANNER_PREFIXES) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return prefix;
    }
    // Dotfile families also match their suffix form (`/.env.local`).
    if (prefix.startsWith("/.") && normalized.startsWith(prefix)) return prefix;
  }
  return null;
}

export type PathVerdict =
  | { action: "allow" }
  | { action: "not-found" }
  | { action: "trap"; signal: "scanner_path"; family: string };

/**
 * Single decision point used by the proxy for every storefront request.
 *
 * `/admin` is a plain unconditional 404 (it is a known-but-removed surface, not
 * an attack), while scanner families are 404 *and* a tier-1 signal.
 */
export function classifyRequestPath(pathname: string): PathVerdict {
  if (isAdminPath(pathname)) return { action: "not-found" };
  const family = matchScannerPath(pathname);
  if (family) return { action: "trap", signal: "scanner_path", family };
  return { action: "allow" };
}
