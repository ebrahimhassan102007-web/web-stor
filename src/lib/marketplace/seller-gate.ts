/**
 * Merchant security gate (S-26) — the red line for the isolated seller portal.
 *
 * A seller may only push anything **live** (a catalog listing or real
 * fulfillment stock) when all three independent conditions hold:
 *
 *   1. the account's **email is verified** (no throwaway/unconfirmed account);
 *   2. **TOTP two-factor** is enabled (a stolen password alone is not enough);
 *   3. the **seller profile is approved** by the owner (`npm run ops`).
 *
 * The gate is a pure function so the rule is identical in the API (403), in the
 * `/seller` readiness checklist and in the tests. Bilingual copy lives here so
 * the checklist and the API can never drift apart.
 */

export const SELLER_GATE_KEYS = ["email", "two-factor", "approval"] as const;
export type SellerGateKey = (typeof SELLER_GATE_KEYS)[number];

export type SellerGateCheck = {
  key: SellerGateKey;
  ok: boolean;
  en: string;
  ar: string;
};

export type SellerStatus = "pending" | "approved" | "rejected" | "suspended" | null;

export type SellerGateInput = {
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  sellerStatus: SellerStatus;
};

export type SellerGateResult = {
  checks: SellerGateCheck[];
  /** True only when every check passes. */
  ready: boolean;
  /** Friendly code for the first unmet gate, or null when ready. */
  blocker: SellerGateBlocker | null;
  /** Bilingual explanation of the first unmet gate. */
  blockerEn: string;
  blockerAr: string;
};

export type SellerGateBlocker = "EMAIL_UNVERIFIED" | "TWO_FACTOR_REQUIRED" | "SELLER_NOT_APPROVED";

const COPY = {
  email: {
    en: "Email verified",
    ar: "البريد الإلكتروني موثّق",
    hintEn: "Verify your email address from the link we sent you.",
    hintAr: "وثّق بريدك الإلكتروني من الرابط اللي بعتناه.",
  },
  "two-factor": {
    en: "Two-factor authentication enabled",
    ar: "المصادقة الثنائية مفعّلة",
    hintEn: "Enable TOTP two-factor authentication in your account settings.",
    hintAr: "فعّل المصادقة الثنائية (TOTP) من إعدادات حسابك.",
  },
  approval: {
    en: "Seller profile approved",
    ar: "ملف التاجر معتمد",
    hintEn: "Your store is waiting for owner approval.",
    hintAr: "متجرك مستني موافقة المالك.",
  },
} as const;

/**
 * Evaluate the three gates. `sellerStatus` is read from the database on every
 * request — it is never taken from a cookie, a JWT claim or a request body.
 */
export function evaluateSellerGates(input: SellerGateInput): SellerGateResult {
  const approved = input.sellerStatus === "approved";
  const checks: SellerGateCheck[] = [
    { key: "email", ok: input.emailVerified === true, en: COPY.email.en, ar: COPY.email.ar },
    {
      key: "two-factor",
      ok: input.twoFactorEnabled === true,
      en: COPY["two-factor"].en,
      ar: COPY["two-factor"].ar,
    },
    { key: "approval", ok: approved, en: COPY.approval.en, ar: COPY.approval.ar },
  ];

  const firstUnmet = checks.find((check) => !check.ok);
  if (!firstUnmet) {
    return { checks, ready: true, blocker: null, blockerEn: "", blockerAr: "" };
  }

  const blocker: SellerGateBlocker =
    firstUnmet.key === "email"
      ? "EMAIL_UNVERIFIED"
      : firstUnmet.key === "two-factor"
        ? "TWO_FACTOR_REQUIRED"
        : "SELLER_NOT_APPROVED";
  const hint = firstUnmet.key === "approval" ? COPY.approval : firstUnmet.key === "email" ? COPY.email : COPY["two-factor"];
  return {
    checks,
    ready: false,
    blocker,
    blockerEn: hint.hintEn,
    blockerAr: hint.hintAr,
  };
}

/** HTTP status used for every refused seller mutation: always 403. */
export const SELLER_GATE_HTTP_STATUS = 403;
