/**
 * Auth rate-limit bucket planning (S-02/S-04) — pure and unit-testable.
 *
 * The authenticated/expensive surfaces (login, register, verification codes,
 * password reset, 2FA, Google OAuth) must each satisfy a set of independent
 * buckets. This module decides *which* buckets a request needs; the HMAC
 * digesting and the atomic database counters live in `auth-rate-limit.ts`.
 *
 * Fail-closed invariant: `planAuthRateBuckets` never returns an empty list.
 * Previously the planner lived behind a "trusted client IP exists?" check, so a
 * deployment without `TRUST_PROXY_IP_HEADERS=true` produced NO buckets at all
 * for identity-less routes (password-reset consumption, 2FA verification,
 * OAuth start/callback) — those endpoints were effectively unlimited.
 */
import { clientFingerprint, trustedClientIp } from "@/lib/security/client-ip";

export type AuthRatePolicy = {
  windowMs: number;
  ipLimit: number;
  emailLimit?: number;
  /**
   * Combined IP+email bucket (S-04). This is the tight bucket: it stops one
   * source hammering one account without letting that source lock the real
   * owner (on a different IP) out of their account.
   */
  combinedLimit?: number;
};

/**
 * Extra head-room applied to the per-client fallback bucket. Without trusted
 * proxy headers the client key is a coarse, rotatable header fingerprint (not
 * an address), so the bucket must be loose enough never to lock real visitors
 * out while still bounding a single-source flood.
 */
export const FALLBACK_CLIENT_MULTIPLIER = 20;

export type AuthRateBucketPlan = {
  /** "ip" == per client, "ip-email" == per client+account, "email" == per account. */
  kind: "ip" | "email" | "ip-email";
  /** Raw bucket value; callers HMAC it before storage. Never persisted as-is. */
  value: string;
  limit: number;
};

export function planAuthRateBuckets(input: {
  request: Request;
  email: string | undefined;
  policy: AuthRatePolicy;
  trustProxyHeaders: boolean;
}): AuthRateBucketPlan[] {
  const { request, email, policy, trustProxyHeaders } = input;
  const plans: AuthRateBucketPlan[] = [];
  const clientIp = trustedClientIp(request, trustProxyHeaders);

  if (clientIp) {
    plans.push({ kind: "ip", value: `ip:${clientIp}`, limit: policy.ipLimit });
    if (email !== undefined && policy.combinedLimit !== undefined) {
      plans.push({
        kind: "ip-email",
        value: `${clientIp}\0${email.toLowerCase()}`,
        limit: policy.combinedLimit,
      });
    }
  } else {
    const fingerprint = clientFingerprint(request.headers);
    if (email === undefined) {
      // Nothing else keys this request, so enforce a bounded per-client budget
      // rather than silently skipping the limit. Without an email there is no
      // account that could be locked out by a shared fingerprint.
      plans.push({
        kind: "ip",
        value: `fallback:${fingerprint}`,
        limit: policy.ipLimit * FALLBACK_CLIENT_MULTIPLIER,
      });
    }
    // For email-bearing requests we deliberately do NOT add a fingerprint
    // bucket: a fingerprint is guessable (browser + locale), so binding the
    // tight per-account bucket to it would let one attacker lock the real
    // owner out — exactly what the documented high per-email ceiling exists to
    // prevent. Without a trustworthy client address the per-account ceiling
    // remains the enforced control.
  }

  if (email !== undefined && policy.emailLimit !== undefined) {
    plans.push({ kind: "email", value: email.toLowerCase(), limit: policy.emailLimit });
  }

  // Fail-closed: never return an empty plan (that would mean "no limit").
  if (plans.length === 0) {
    plans.push({
      kind: "ip",
      value: `fallback:${clientFingerprint(request.headers)}`,
      limit: policy.ipLimit * FALLBACK_CLIENT_MULTIPLIER,
    });
  }

  return plans;
}
