/**
 * Google account-linking policy (S-01 — pre-account takeover defense).
 *
 * Attack: an attacker registers with the victim's email + a password they
 * control (email unverified). When the real owner later signs in with
 * Google, a naive "link by email" marks the account verified while KEEPING
 * the attacker's password hash — the attacker can still log in.
 *
 * Policy: linking Google to an UNVERIFIED password account must
 *  - clear the stored password hash (password login disabled),
 *  - delete any pending email-verification code,
 *  - revoke every existing session for that user.
 * Linking to an already-verified account only revokes other sessions when
 * the Google identity itself changes (first link).
 */
export type GoogleLinkPlan =
  | { action: "reject"; reason: "different-google-identity" }
  | {
      action: "link";
      clearPasswordHash: boolean;
      deleteVerificationCodes: boolean;
      revokeAllSessions: boolean;
    };

export type ExistingAccountForLink = {
  googleSub: string | null;
  emailVerifiedAt: Date | null;
  hasPasswordHash: boolean;
};

export function planGoogleLink(
  existing: ExistingAccountForLink,
  googleSubject: string,
): GoogleLinkPlan {
  if (existing.googleSub && existing.googleSub !== googleSubject) {
    return { action: "reject", reason: "different-google-identity" };
  }
  const unverified = existing.emailVerifiedAt === null;
  const firstLink = existing.googleSub === null;
  return {
    action: "link",
    // The core S-01 fix: an unverified password must not survive linking.
    clearPasswordHash: unverified && existing.hasPasswordHash,
    deleteVerificationCodes: unverified,
    revokeAllSessions: unverified || firstLink,
  };
}
