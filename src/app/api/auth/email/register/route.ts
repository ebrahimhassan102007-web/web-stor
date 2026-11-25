import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { guardMutatingRequest, rejectHoneypot } from "@/lib/security/request-guard";
import { isHoneypotTripped } from "@/lib/security/honeypot";
import { emailRegisterSchema } from "@/lib/security/auth-validation";
import { readAuthJson } from "@/lib/security/auth-http";
import { isAuthSecretConfigured, enforceAuthRateLimit } from "@/lib/security/auth-rate-limit";
import { isEmailDeliveryConfigured } from "@/lib/security/email";
import { hashPassword } from "@/lib/security/auth-core";
import { issueEmailVerification } from "@/lib/security/email-verification";
import { sellerApplySchema, type SellerApplyInput } from "@/lib/marketplace/seller-validation";
import { createSellerApplication } from "@/lib/marketplace/seller-store";

export const dynamic = "force-dynamic";

/**
 * Dual-role registration (S-26).
 *
 * **Customer (default)** — unchanged one-step signup: display name, email,
 * password (or Google). Zero extra fields, zero extra steps, and the existing
 * form selectors keep working.
 *
 * **Merchant** — the same account, plus a `pending` seller profile created in
 * the same transaction from `seller_profiles` (`0004`). Nothing is approved
 * here: the owner approves locally (`npm run ops -- sellers approve`), and until
 * then the merchant portal refuses every live write with `403`.
 */
export async function POST(request: NextRequest) {
  const guard = await guardMutatingRequest(request);
  if (guard) return guard;
  if (!isAuthSecretConfigured()) return jsonError("AUTH_NOT_CONFIGURED", 503);

  const body = await readAuthJson(request);
  if (!body.ok) return jsonError("INVALID_BODY", 400);
  if (isHoneypotTripped(body.value)) return rejectHoneypot(request);
  const parsed = emailRegisterSchema.safeParse(body.value);
  if (!parsed.success) return jsonError("INVALID_INPUT", 400);
  const { displayName, email, password, locale, accountType } = parsed.data;
  const merchant = accountType === "merchant";

  let application: SellerApplyInput | undefined;
  if (merchant) {
    const candidate = {
      storeName: parsed.data.storeName ?? "",
      storeSlug: parsed.data.storeSlug ?? "",
      storeDescription: parsed.data.storeDescription ?? "",
      phone: parsed.data.storePhone ?? "",
      country: parsed.data.storeCountry ?? "",
      termsAccepted: parsed.data.termsAccepted === true,
    };
    const applied = sellerApplySchema.safeParse(candidate);
    if (!applied.success) return jsonError("INVALID_INPUT", 400);
    application = applied.data;
  }

  try {
    if (
      !(await enforceAuthRateLimit(request, "register", email, {
        windowMs: 60 * 60 * 1000,
        ipLimit: 12,
        emailLimit: 3,
      }))
    ) {
      return jsonError("RATE_LIMITED", 429);
    }

    if (!isEmailDeliveryConfigured()) {
      return jsonError("EMAIL_NOT_CONFIGURED", 503);
    }

    const passwordHash = await hashPassword(password);
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(users)
        .values({
          displayName,
          email,
          passwordHash,
          role: merchant ? "seller" : "customer",
        })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id });
      if (!row || !application) return row;

      const seller = await createSellerApplication(tx, {
        userId: row.id,
        application,
        source: "signup",
      });
      if (!seller.ok) {
        // The slug belongs to somebody else: roll the whole signup back so the
        // buyer is not left with a half-created merchant account.
        throw new Error("SELLER_SLUG_TAKEN");
      }
      return row;
    });

    if (created) {
      try {
        await issueEmailVerification(created.id, locale);
      } catch (error) {
        console.error(
          "[auth:register] verification email delivery failed",
          error instanceof Error ? error.name : "UnknownError",
        );
        return jsonError("EMAIL_DELIVERY_FAILED", 503);
      }
    } else {
      // Match the response for existing addresses to avoid account
      // enumeration. Verified users can continue through sign-in instead.
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (!existing) return jsonError("AUTH_UNAVAILABLE", 503);
    }

    return jsonOk({ verificationRequired: true, accountType }, { status: 202 });
  } catch (error) {
    if (error instanceof Error && error.message === "SELLER_SLUG_TAKEN") {
      return jsonError("SELLER_SLUG_TAKEN", 409);
    }
    console.error("[auth:register] request could not be completed");
    return jsonError("AUTH_UNAVAILABLE", 503);
  }
}
